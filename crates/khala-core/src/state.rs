use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const HISTORY_LIMIT: usize = 50;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GreetRecord {
    pub name: String,
    pub greeting: String,
    pub at_ms: u64,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Default)]
pub struct Ctx {
    greet_history: Mutex<Vec<GreetRecord>>,
}

impl Ctx {
    pub fn push_greet(&self, record: GreetRecord) {
        let mut history = self.lock();
        history.push(record);
        let overflow = history.len().saturating_sub(HISTORY_LIMIT);
        if overflow > 0 {
            history.drain(..overflow);
        }
    }

    pub fn greet_history(&self) -> Vec<GreetRecord> {
        self.lock().clone()
    }

    pub fn greet_history_len(&self) -> usize {
        self.lock().len()
    }

    pub fn greet_history_is_empty(&self) -> bool {
        self.lock().is_empty()
    }

    pub fn clear_greet_history(&self) {
        self.lock().clear();
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<GreetRecord>> {
        self.greet_history.lock().expect("greet_history mutex poisoned")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(name: &str) -> GreetRecord {
        GreetRecord {
            name: name.into(),
            greeting: format!("hi {name}"),
            at_ms: now_ms(),
        }
    }

    #[test]
    fn history_is_capped_at_limit() {
        let ctx = Ctx::default();
        for i in 0..(HISTORY_LIMIT + 5) {
            ctx.push_greet(record(&format!("n{i}")));
        }
        assert_eq!(ctx.greet_history_len(), HISTORY_LIMIT);
        assert_eq!(ctx.greet_history().first().unwrap().name, "n5");
    }

    #[test]
    fn clear_empties_history() {
        let ctx = Ctx::default();
        ctx.push_greet(record("a"));
        ctx.clear_greet_history();
        assert_eq!(ctx.greet_history_len(), 0);
    }

    #[test]
    fn record_serializes_camel_case() {
        let v = serde_json::to_value(record("a")).unwrap();
        assert!(v.get("atMs").is_some(), "expected camelCase atMs, got {v}");
    }
}
