# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN sh ./mvnw -B -ntp dependency:go-offline
COPY src/ src/
RUN sh ./mvnw -B -ntp package -DskipTests

FROM eclipse-temurin:25-jre
RUN groupadd --system sino && useradd --system --gid sino --no-create-home sino
WORKDIR /app
COPY --from=build /src/target/sino-api-*.jar app.jar
USER sino
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]