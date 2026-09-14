use std::error::Error;
use std::io::{self, Read};

use aws_nitro_enclaves_nsm_api::api::{Request, Response};
use aws_nitro_enclaves_nsm_api::driver::{nsm_exit, nsm_init, nsm_process_request};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;
use serde_bytes::ByteBuf;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AttestationInput {
    user_data: String,
    nonce: Option<String>,
    public_key: Option<String>,
}

fn decode_optional_base64(
    value: Option<String>,
    field: &str,
) -> Result<Option<ByteBuf>, Box<dyn Error>> {
    value
        .map(|encoded| {
            BASE64
                .decode(encoded)
                .map(ByteBuf::from)
                .map_err(|error| format!("invalid {field} base64: {error}").into())
        })
        .transpose()
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let input: AttestationInput = serde_json::from_str(&input)?;
    let user_data = ByteBuf::from(
        hex::decode(&input.user_data).map_err(|error| format!("invalid user_data hex: {error}"))?,
    );
    let nonce = decode_optional_base64(input.nonce, "nonce")?;
    let public_key = decode_optional_base64(input.public_key, "public_key")?;

    let fd = nsm_init();
    if fd < 0 {
        return Err("/dev/nsm is unavailable (nsm_init failed)".into());
    }

    let response = nsm_process_request(
        fd,
        Request::Attestation {
            user_data: Some(user_data),
            nonce,
            public_key,
        },
    );
    nsm_exit(fd);

    match response {
        Response::Attestation { document } => {
            print!("{}", BASE64.encode(document));
            Ok(())
        }
        Response::Error(code) => Err(format!("NSM attestation failed: {code:?}").into()),
        other => Err(format!("unexpected NSM response: {other:?}").into()),
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("nsm-attest: {error}");
        std::process::exit(1);
    }
}
