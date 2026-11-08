use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::state::Ctx;

pub fn dispatch(ctx: &Ctx, command: &str, args: Value) -> AppResult<Value> {
    let args = if args.is_null() {
        Value::Object(Default::default())
    } else {
        args
    };
    match command {
        "greet" => call(ctx, command, args, crate::greet),
        "reset" => call(ctx, command, args, crate::reset),
        "info" => call(ctx, command, args, crate::app_info),
        other => Err(AppError::NotFound(format!("unknown command `{other}`"))),
    }
}

fn call<A: DeserializeOwned, O: serde::Serialize>(
    ctx: &Ctx,
    command: &str,
    args: Value,
    f: fn(&Ctx, A) -> AppResult<O>,
) -> AppResult<Value> {
    let args = serde_json::from_value(args)
        .map_err(|e| AppError::InvalidArg(format!("bad args for `{command}`: {e}")))?;
    let out = f(ctx, args)?;
    serde_json::to_value(out)
        .map_err(|e| AppError::Internal(format!("serialize output of `{command}`: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn routes_greet_and_serializes_output() {
        let ctx = Ctx::default();
        let out = dispatch(&ctx, "greet", json!({ "name": "Ego" })).unwrap();
        assert!(out["greeting"].as_str().unwrap().contains("Ego"));
    }

    #[test]
    fn null_body_becomes_empty_args() {
        let ctx = Ctx::default();
        let out = dispatch(&ctx, "info", Value::Null).unwrap();
        assert_eq!(out["name"], "khala");
        assert_eq!(out["gitHash"], crate::GIT_HASH);
    }

    #[test]
    fn unknown_command_is_not_found() {
        let ctx = Ctx::default();
        let err = dispatch(&ctx, "nope", json!({})).unwrap_err();
        assert_eq!(err.code(), "not_found");
    }

    #[test]
    fn bad_args_is_invalid_arg() {
        let ctx = Ctx::default();
        let err = dispatch(&ctx, "greet", json!({ "wrong": 1 })).unwrap_err();
        assert_eq!(err.code(), "invalid_arg");
    }
}
