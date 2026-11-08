use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use khala_core::state::Ctx;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "khala_server=info,tower_http=warn".into()),
        )
        .init();

    let port = port_from_args_or_env();
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let ctx = Arc::new(Ctx::default());
    let mut app = khala_server::router(ctx);

    if let Some(dir) = static_root() {
        tracing::info!("serving static frontend from {}", dir.display());
        app = app.fallback_service(ServeDir::new(dir).append_index_html_on_directories(true));
    }

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("error: cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    tracing::info!("khala-server v{} ({})", khala_core::VERSION, khala_core::GIT_HASH);
    tracing::info!("listening on http://{addr}");
    tracing::info!("endpoints: GET /api/health | GET /api/version | POST /api/rpc/{{command}}");

    if let Err(e) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        eprintln!("error: server failed: {e}");
        std::process::exit(1);
    }
}

fn port_from_args_or_env() -> u16 {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(i) = args.iter().position(|a| a == "--port") {
        return match args.get(i + 1).and_then(|s| s.parse::<u16>().ok()) {
            Some(v) => v,
            None => {
                eprintln!("error: --port requires a port number");
                std::process::exit(2);
            }
        };
    }
    if let Ok(v) = std::env::var("KHALA_PORT") {
        match v.parse::<u16>() {
            Ok(p) => return p,
            Err(_) => eprintln!("warning: invalid KHALA_PORT {v:?}, using default 14034"),
        }
    }
    14034
}

fn static_root() -> Option<PathBuf> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = args.iter().position(|a| a == "--static")?;
    let dir = args
        .get(flag + 1)
        .filter(|s| !s.starts_with('-'))
        .cloned()
        .unwrap_or_else(|| "./dist".to_owned());
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        eprintln!("error: --static directory {dir:?} does not exist");
        std::process::exit(2);
    }
    Some(path)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("ctrl-c received, shutting down");
}
