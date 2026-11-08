use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::state::{now_ms, Ctx, GreetRecord};

const NAME_MAX_CHARS: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GreetArgs {
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GreetOut {
    pub greeting: String,
    pub history: Vec<GreetRecord>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetArgs {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOut {
    pub history: Vec<GreetRecord>,
}

pub fn greet(ctx: &Ctx, args: GreetArgs) -> AppResult<GreetOut> {
    let name = args.name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidArg("name must not be empty".into()));
    }
    let len = name.chars().count();
    if len > NAME_MAX_CHARS {
        return Err(AppError::InvalidArg(format!(
            "name too long: {len} chars (max {NAME_MAX_CHARS})"
        )));
    }
    let greeting = format!("Hello, {name}! You've been greeted by khala-core.");
    ctx.push_greet(GreetRecord {
        name: name.to_owned(),
        greeting: greeting.clone(),
        at_ms: now_ms(),
    });
    Ok(GreetOut {
        greeting,
        history: ctx.greet_history(),
    })
}

pub fn reset(ctx: &Ctx, _args: ResetArgs) -> AppResult<HistoryOut> {
    ctx.clear_greet_history();
    Ok(HistoryOut {
        history: ctx.greet_history(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_trims_and_records() {
        let ctx = Ctx::default();
        let out = greet(&ctx, GreetArgs { name: "  Ego ".into() }).unwrap();
        assert_eq!(out.greeting, "Hello, Ego! You've been greeted by khala-core.");
        assert_eq!(out.history.len(), 1);
        assert_eq!(out.history[0].name, "Ego");
    }

    #[test]
    fn empty_name_is_rejected() {
        let ctx = Ctx::default();
        let err = greet(&ctx, GreetArgs { name: "   ".into() }).unwrap_err();
        assert_eq!(err.code(), "invalid_arg");
    }

    #[test]
    fn oversized_name_is_rejected() {
        let ctx = Ctx::default();
        let err = greet(
            &ctx,
            GreetArgs { name: "x".repeat(NAME_MAX_CHARS + 1) },
        )
        .unwrap_err();
        assert_eq!(err.code(), "invalid_arg");
    }

    #[test]
    fn reset_clears() {
        let ctx = Ctx::default();
        greet(&ctx, GreetArgs { name: "a".into() }).unwrap();
        let out = reset(&ctx, ResetArgs {}).unwrap();
        assert!(out.history.is_empty());
    }

    #[test]
    fn greet_args_parses_plain_json() {
        let args: GreetArgs = serde_json::from_str(r#"{ "name": "Ego" }"#).unwrap();
        assert_eq!(args.name, "Ego");
    }
}
