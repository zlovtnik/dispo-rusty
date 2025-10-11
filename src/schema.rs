// @generated automatically by Diesel CLI.

diesel::table! {
    configuration (key) {
        #[max_length = 255]
        key -> Varchar,
        value -> Text,
        #[max_length = 100]
        category -> Nullable<Varchar>,
        created_at -> Nullable<Timestamptz>,
        updated_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    login_history (id) {
        id -> Int4,
        user_id -> Int8,
        login_timestamp -> Timestamptz,
    }
}

diesel::table! {
    people (id) {
        id -> Int4,
        name -> Varchar,
        gender -> Bool,
        age -> Int4,
        address -> Varchar,
        #[max_length = 11]
        phone -> Varchar,
        email -> Varchar,
    }
}

diesel::table! {
    refresh_tokens (id) {
        id -> Int4,
        user_id -> Int8,
        token -> Varchar,
        expires_at -> Timestamptz,
        created_at -> Nullable<Timestamptz>,
        revoked -> Nullable<Bool>,
    }
}

diesel::table! {
    sessions (session_id) {
        #[max_length = 255]
        session_id -> Varchar,
        #[max_length = 255]
        user_id -> Varchar,
        created_at -> Nullable<Timestamptz>,
        expires_at -> Timestamptz,
        is_valid -> Nullable<Bool>,
    }
}

diesel::table! {
    tenants (id) {
        id -> Varchar,
        name -> Varchar,
        db_url -> Text,
        created_at -> Nullable<Timestamptz>,
        updated_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    users (id) {
        id -> Int8,
        username -> Varchar,
        email -> Varchar,
        password -> Varchar,
        login_session -> Varchar,
        active -> Bool,
    }
}

diesel::joinable!(login_history -> users (user_id));
diesel::joinable!(refresh_tokens -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    configuration,
    login_history,
    people,
    refresh_tokens,
    sessions,
    tenants,
    users,
);
