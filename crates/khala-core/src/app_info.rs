use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::state::Ctx;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoArgs {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoOut {
    pub name: &'static str,
    pub version: &'static str,
    pub git_hash: &'static str,
}

pub fn app_info(_ctx: &Ctx, _args: InfoArgs) -> AppResult<InfoOut> {
    Ok(InfoOut {
        name: "khala",
        version: crate::VERSION,
        git_hash: crate::GIT_HASH,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_serializes_camel_case() {
        let ctx = Ctx::default();
        let v = serde_json::to_value(app_info(&ctx, InfoArgs {}).unwrap()).unwrap();
        assert_eq!(v["name"], "khala");
        assert_eq!(v["gitHash"], crate::GIT_HASH);
    }
}
