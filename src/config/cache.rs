use r2d2;
use redis;

pub type Pool = r2d2::Pool<RedisManager>;

pub struct RedisManager {
    client: redis::Client,
}

impl r2d2::ManageConnection for RedisManager {
    type Connection = redis::Connection;
    type Error = redis::RedisError;

    fn connect(&self) -> Result<Self::Connection, Self::Error> {
        self.client.get_connection().map_err(|e| e)
    }

    fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        redis::cmd("PING").query(conn).map_err(|e| e)
    }

    fn has_broken(&self, conn: &mut Self::Connection) -> bool {
        false
    }
}

pub fn init_redis_client(url: &str) -> Pool {
    use log::info;
    info!("Initializing Redis client...");
    let masked_url = mask_redis_url(url);
    let client = redis::Client::open(url).unwrap_or_else(|e| {
        panic!("Failed to create Redis client for {}: {}", masked_url, e);
    });
    let manager = RedisManager { client };
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
