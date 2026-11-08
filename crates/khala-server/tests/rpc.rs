use std::sync::Arc;

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use http_body_util::BodyExt;
use khala_core::state::Ctx;
use khala_server::SharedCtx;
use serde_json::Value;
use tower::ServiceExt;

fn app() -> Router {
    khala_server::router(Arc::new(Ctx::default()) as SharedCtx)
}

async fn json_body(resp: Response) -> Value {
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

fn post_json(uri: &str, body: &'static str) -> Request<Body> {
    Request::post(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap()
}

#[tokio::test]
async fn health_reports_ok() {
    let resp = app()
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let v = json_body(resp).await;
    assert_eq!(v["status"], "ok");
    assert_eq!(v["name"], "khala");
    assert_eq!(v["version"], khala_core::VERSION);
    assert_eq!(v["historyLen"], 0);
}

#[tokio::test]
async fn greet_roundtrip_and_camel_case_history() {
    let app = app();
    let resp = app
        .clone()
        .oneshot(post_json("/api/rpc/greet", r#"{ "name": "Ego" }"#))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let v = json_body(resp).await;
    assert!(v["greeting"].as_str().unwrap().contains("Ego"));
    assert_eq!(v["history"].as_array().unwrap().len(), 1);
    assert_eq!(v["history"][0]["name"], "Ego");
    assert!(
        v["history"][0]["atMs"].is_u64(),
        "expected camelCase atMs, got {v}"
    );
}

#[tokio::test]
async fn greet_history_persists_across_calls() {
    let app = app();
    app.clone()
        .oneshot(post_json("/api/rpc/greet", r#"{ "name": "a" }"#))
        .await
        .unwrap();
    let resp = app
        .oneshot(post_json("/api/rpc/greet", r#"{ "name": "b" }"#))
        .await
        .unwrap();
    let v = json_body(resp).await;
    assert_eq!(v["history"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn empty_name_is_invalid_arg() {
    let resp = app()
        .oneshot(post_json("/api/rpc/greet", r#"{ "name": "  " }"#))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let v = json_body(resp).await;
    assert_eq!(v["code"], "invalid_arg");
    assert!(v["message"].as_str().unwrap().contains("empty"));
}

#[tokio::test]
async fn unknown_command_is_not_found() {
    let resp = app()
        .oneshot(post_json("/api/rpc/nope", r#"{}"#))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    let v = json_body(resp).await;
    assert_eq!(v["code"], "not_found");
}

#[tokio::test]
async fn reset_clears_history() {
    let app = app();
    app.clone()
        .oneshot(post_json("/api/rpc/greet", r#"{ "name": "a" }"#))
        .await
        .unwrap();
    let resp = app
        .oneshot(post_json("/api/rpc/reset", r#"{}"#))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let v = json_body(resp).await;
    assert_eq!(v["history"].as_array().unwrap().len(), 0);
}
