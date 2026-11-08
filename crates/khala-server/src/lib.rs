use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use khala_core::state::Ctx;
use khala_core::{AppError, InfoArgs, InfoOut};
use serde_json::{json, Value};
use tower_http::trace::TraceLayer;

pub type SharedCtx = Arc<Ctx>;

pub fn router(ctx: SharedCtx) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/version", get(version))
        .route("/api/rpc/{command}", post(rpc))
        .with_state(ctx)
        .layer(TraceLayer::new_for_http())
}

async fn health(State(ctx): State<SharedCtx>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "name": "khala",
        "version": khala_core::VERSION,
        "gitHash": khala_core::GIT_HASH,
        "historyLen": ctx.greet_history_len(),
    }))
}

async fn version(State(ctx): State<SharedCtx>) -> Result<Json<InfoOut>, Response> {
    khala_core::app_info(&ctx, InfoArgs::default())
        .map(Json)
        .map_err(error_response)
}

async fn rpc(
    State(ctx): State<SharedCtx>,
    Path(command): Path<String>,
    body: Option<Json<Value>>,
) -> Response {
    let args = body
        .map(|Json(v)| v)
        .filter(|v| !v.is_null())
        .unwrap_or_else(|| json!({}));
    khala_core::dispatch(&ctx, &command, args)
        .map(|out| Json(out).into_response())
        .unwrap_or_else(error_response)
}

fn error_response(err: AppError) -> Response {
    let status = match err.code() {
        "invalid_arg" => StatusCode::BAD_REQUEST,
        "not_found" => StatusCode::NOT_FOUND,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(err)).into_response()
}
