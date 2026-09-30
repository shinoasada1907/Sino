package dev.sino;

import org.springframework.boot.SpringApplication;

public class TestSinoApiApplication {

    public static void main(String[] args) {
        SpringApplication.from(SinoApiApplication::main).with(TestcontainersConfiguration.class).run(args);
    }

}
