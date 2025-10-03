use r2d2;
use r2d2_redis::RedisConnectionManager;

pub type Pool = r2d2::Pool<RedisConnectionManager>;
pub type CacheConnection = r2d2::PooledConnection<RedisConnectionManager>;

pub fn init_redis_client(url: &str) -> Pool {
    use log::info;
    info!("Initializing Redis client...");
    let masked_url = mask_redis_url(url);
    let manager = RedisConnectionManager::new(url).unwrap_or_else(|e| {
        panic!("Failed to create Redis connection manager for {}: {}", masked_url, e);
    });
    r2d2::Pool::builder().build(manager).unwrap_or_else(|e| {
        panic!("Failed to create Redis pool for {}: {}", masked_url, e);
    })
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

pub fn get_redis_connection(pool: &Pool) -> Result<CacheConnection, r2d2::Error> {
    pool.get()
}
