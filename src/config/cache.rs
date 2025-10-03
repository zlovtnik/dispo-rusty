use redis::Client as RedisClient;
use redis::Connection;

pub type CacheConnection = Connection;

pub fn init_redis_client(url: &str) -> RedisClient {
    use log::info;
    info!("Initializing Redis client...");
    match RedisClient::open(url) {
        Ok(client) => client,
        Err(e) => panic!("Failed to create Redis client for {}: {}", mask_redis_url(url), e),
    }
}

fn mask_redis_url(input: &str) -> String {
    if let Some(at_pos) = input.find('@') {
        if let Some(colon_pos) = input[..at_pos].rfind(':') {
            format!("{}:<redacted>{}", &input[..colon_pos], &input[at_pos..])
        } else {
            input.to_string()
        }
    } else {
        input.to_string()
    }
}

pub fn get_redis_connection(client: &RedisClient) -> Result<CacheConnection, redis::RedisError> {
    client.get_connection()
}
