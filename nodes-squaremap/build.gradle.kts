/*
 * nodes-squaremap
 * Bukkit addon that renders nodes territories/nodes/ports on squaremap
 * by reading the nodes plugin JSON state files (pure file coupling,
 * no dependency on the unstable nodes API).
 */

plugins {
    `java-library`
}

group = "phonon.nodes"
version = "0.0.1"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:26.2.build.112-stable")
    compileOnly("com.google.code.gson:gson:2.13.2")
    compileOnly("xyz.jpenilla:squaremap-api:1.3.11")

    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks {
    test {
        useJUnitPlatform()
    }
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

tasks {
    jar {
        archiveBaseName.set("nodes-squaremap")
    }
}
