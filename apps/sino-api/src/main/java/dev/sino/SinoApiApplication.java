package dev.sino;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SinoApiApplication {

    public static void main(String[] args) {
        // D-23: the server runs in UTC whatever the host zone is. The PostgreSQL driver sends the JVM zone
        // on connect, and legacy ids such as "Asia/Saigon" are rejected by images without tzdata-legacy.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(SinoApiApplication.class, args);
    }

}
