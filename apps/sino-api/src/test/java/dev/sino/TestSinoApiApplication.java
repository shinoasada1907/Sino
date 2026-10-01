package dev.sino;

import org.springframework.boot.SpringApplication;

public class TestSinoApiApplication {

    public static void main(String[] args) {
        // The `test` profile supplies the fake API user that the default profile requires from the environment.
        SpringApplication.from(SinoApiApplication::main)
                .with(TestcontainersConfiguration.class)
                .withAdditionalProfiles("test")
                .run(args);
    }

}
