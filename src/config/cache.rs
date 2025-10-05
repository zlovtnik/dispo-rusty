use r2d2;
use redis;

pub type Pool = r2d2::Pool<RedisManager>;

pub struct RedisManager {
    client: redis::Client,
}

impl r2d2::ManageConnection for RedisManager {
    type Connection = redis::Connection;
    type Error = redis::RedisError;

    /// Establishes a new connection to the Redis server using this manager's client.
    ///
    /// # Examples
    ///
    /// ```
    /// let client = redis::Client::open("redis://127.0.0.1/").unwrap();
    /// let manager = RedisManager { client };
    /// let conn = manager.connect().unwrap();
    /// // `conn` is a `redis::Connection` ready to execute commands
    /// ```
    fn connect(&self) -> Result<Self::Connection, Self::Error> {
        self.client.get_connection()
    }

    /// Checks whether a Redis connection is alive by sending a `PING` command.
    ///
    /// Returns `Ok(())` if the connection responds to `PING`, `Err(redis::RedisError)` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::RedisManager;
    ///
    /// let client = redis::Client::open("redis://127.0.0.1/").unwrap();
    /// let manager = RedisManager { client };
    /// let mut conn = manager.client.get_connection().unwrap();
    /// manager.is_valid(&mut conn).unwrap();
    /// ```
    fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        redis::cmd("PING").query(conn)
    }

    /// Indicates whether a pooled Redis connection should be treated as broken and removed from the pool.
    ///
    /// Returns `true` if the connection must be discarded, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Obtain a RedisManager and a connection from its pool in real usage.
    /// let mut manager = /* RedisManager instance */ unimplemented!();
    /// let mut conn = /* redis::Connection from pool */ unimplemented!();
    /// assert!(!manager.has_broken(&mut conn));
    /// ```
    fn has_broken(&self, _conn: &mut Self::Connection) -> bool {
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