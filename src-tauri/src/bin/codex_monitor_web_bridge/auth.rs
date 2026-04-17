use axum::http::{HeaderMap, StatusCode};

pub(crate) fn require_bridge_headers(
    headers: &HeaderMap,
    require_cf_access_header: bool,
) -> Result<(), (StatusCode, String)> {
    if require_cf_access_header && headers.get("cf-access-jwt-assertion").is_none() {
        return Err((
            StatusCode::UNAUTHORIZED,
            "missing Cloudflare access header".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::require_bridge_headers;
    use axum::http::{HeaderMap, HeaderValue, StatusCode};

    #[test]
    fn rejects_missing_cloudflare_header_when_required() {
        let headers = HeaderMap::new();

        let error = require_bridge_headers(&headers, true).expect_err("missing header should fail");

        assert_eq!(error.0, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn allows_request_when_header_present() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cf-access-jwt-assertion",
            HeaderValue::from_static("present"),
        );

        require_bridge_headers(&headers, true).expect("header should pass");
    }
}
