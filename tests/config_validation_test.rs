//\! Configuration File Validation Tests
//\!
//\! Tests to validate configuration files and ensure they are properly formatted
//\! and contain required values.

use std::fs;
use std::path::Path;

#[test]
fn test_rust_toolchain_exists() {
    let path = Path::new("rust-toolchain.toml");
    assert\!(path.exists(), "rust-toolchain.toml should exist");
}

#[test]
fn test_rust_toolchain_valid_toml() {
    let content = fs::read_to_string("rust-toolchain.toml")
        .expect("Failed to read rust-toolchain.toml");
    
    let parsed: toml::Value = toml::from_str(&content)
        .expect("rust-toolchain.toml should be valid TOML");
    
    assert\!(parsed.is_table(), "rust-toolchain.toml should be a TOML table");
}

#[test]
fn test_rust_toolchain_has_toolchain_section() {
    let content = fs::read_to_string("rust-toolchain.toml")
        .expect("Failed to read rust-toolchain.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    assert\!(
        parsed.get("toolchain").is_some(),
        "rust-toolchain.toml should have a 'toolchain' section"
    );
}

#[test]
fn test_rust_toolchain_channel_specified() {
    let content = fs::read_to_string("rust-toolchain.toml")
        .expect("Failed to read rust-toolchain.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    let toolchain = parsed.get("toolchain").expect("toolchain section should exist");
    let channel = toolchain.get("channel");
    
    assert\!(
        channel.is_some(),
        "rust-toolchain.toml should specify a channel"
    );
    
    let channel_str = channel.unwrap().as_str().expect("channel should be a string");
    assert\!(
        \!channel_str.is_empty(),
        "channel should not be empty"
    );
}

#[test]
fn test_cargo_toml_exists() {
    let path = Path::new("Cargo.toml");
    assert\!(path.exists(), "Cargo.toml should exist");
}

#[test]
fn test_cargo_toml_valid() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content)
        .expect("Cargo.toml should be valid TOML");
    
    assert\!(parsed.is_table(), "Cargo.toml should be a TOML table");
}

#[test]
fn test_cargo_toml_has_package() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    assert\!(
        parsed.get("package").is_some(),
        "Cargo.toml should have a 'package' section"
    );
}

#[test]
fn test_cargo_toml_package_name() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    let package = parsed.get("package").unwrap();
    
    let name = package.get("name");
    assert\!(name.is_some(), "Package should have a name");
    
    let name_str = name.unwrap().as_str().unwrap();
    assert\!(\!name_str.is_empty(), "Package name should not be empty");
}

#[test]
fn test_cargo_toml_has_dependencies() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    assert\!(
        parsed.get("dependencies").is_some(),
        "Cargo.toml should have a 'dependencies' section"
    );
}

#[test]
fn test_cargo_toml_functional_feature() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    if let Some(features) = parsed.get("features") {
        if let Some(functional) = features.get("functional") {
            assert\!(functional.is_array(), "functional feature should be an array");
        }
    }
}

#[test]
fn test_cargo_toml_dev_dependencies() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    
    if let Some(dev_deps) = parsed.get("dev-dependencies") {
        assert\!(dev_deps.is_table(), "dev-dependencies should be a table");
        
        // Check for test-related dependencies
        assert\!(
            dev_deps.get("testcontainers").is_some() || 
            dev_deps.get("tempfile").is_some(),
            "Should have test-related dependencies"
        );
    }
}

#[test]
fn test_cargo_toml_key_dependencies_present() {
    let content = fs::read_to_string("Cargo.toml")
        .expect("Failed to read Cargo.toml");
    
    let parsed: toml::Value = toml::from_str(&content).unwrap();
    let deps = parsed.get("dependencies").unwrap();
    
    // Check for critical dependencies
    let critical_deps = vec\!["actix-web", "diesel", "serde", "tokio"];
    
    for dep in critical_deps {
        assert\!(
            deps.get(dep).is_some(),
            "Cargo.toml should have {} dependency", dep
        );
    }
}

#[test]
fn test_gitignore_exists() {
    let path = Path::new(".gitignore");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap();
        assert\!(\!content.is_empty(), ".gitignore should not be empty");
    }
}

#[test]
fn test_readme_exists() {
    let readme_paths = vec\!["README.md", "Readme.md", "readme.md"];
    let exists = readme_paths.iter().any(|p| Path::new(p).exists());
    
    // This is a soft assertion - not all projects have READMEs
    if \!exists {
        eprintln\!("Warning: No README file found");
    }
}

#[test]
fn test_src_directory_structure() {
    assert\!(Path::new("src").exists(), "src directory should exist");
    assert\!(Path::new("src/main.rs").exists(), "src/main.rs should exist");
    assert\!(Path::new("src/functional").exists(), "src/functional directory should exist");
}

#[test]
fn test_functional_module_files() {
    let required_files = vec\![
        "src/functional/mod.rs",
        "src/functional/chain_builder.rs",
        "src/functional/function_traits.rs",
        "src/functional/immutable_state.rs",
        "src/functional/iterator_engine.rs",
        "src/functional/pure_function_registry.rs",
        "src/functional/query_builder.rs",
        "src/functional/query_composition.rs",
        "src/functional/state_transitions.rs",
        "src/functional/validation_engine.rs",
        "src/functional/validation_integration.rs",
        "src/functional/validation_rules.rs",
    ];
    
    for file in required_files {
        assert\!(
            Path::new(file).exists(),
            "Required functional module file should exist: {}", file
        );
    }
}