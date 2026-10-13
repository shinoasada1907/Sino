package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

/**
 * The sign-in lock of D-35: five failures in a row for one email lock it for fifteen minutes.
 */
class LoginAttemptsTests {

    private static final String EMAIL = "owner@sino.test";

    private final MovableClock clock = new MovableClock(Instant.parse("2026-10-07T09:00:00Z"));
    private final LoginAttempts attempts = new LoginAttempts(clock, 100);

    @Test
    void countsDownTheAttemptsLeft() {
        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(4);
        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(3);
        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(2);
        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(1);
        assertThat(attempts.lockedFor(EMAIL)).isEmpty();
    }

    @Test
    void theFifthFailureLocksForFifteenMinutes() {
        failTimes(EMAIL, 4);

        assertThat(attempts.recordFailure(EMAIL)).isZero();

        assertThat(attempts.lockedFor(EMAIL)).contains(Duration.ofMinutes(15));
    }

    @Test
    void theLockRunsOutAfterFifteenMinutesAndTheCountStartsAgain() {
        failTimes(EMAIL, 5);

        clock.advance(Duration.ofMinutes(14));
        assertThat(attempts.lockedFor(EMAIL)).contains(Duration.ofMinutes(1));

        clock.advance(Duration.ofMinutes(1));
        assertThat(attempts.lockedFor(EMAIL)).isEmpty();
        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(4);
    }

    @Test
    void aSuccessfulSignInStartsTheCountAgain() {
        failTimes(EMAIL, 3);

        attempts.recordSuccess(EMAIL);

        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(4);
    }

    @Test
    void failuresAreForgottenFifteenMinutesAfterTheLastOne() {
        attempts.recordFailure(EMAIL);
        clock.advance(Duration.ofMinutes(10));
        attempts.recordFailure(EMAIL);
        clock.advance(Duration.ofMinutes(14));
        assertThat(attempts.recordFailure(EMAIL)).as("14 minutes after the last failure").isEqualTo(2);

        clock.advance(Duration.ofMinutes(15));

        assertThat(attempts.recordFailure(EMAIL)).as("15 minutes after the last failure").isEqualTo(4);
    }

    @Test
    void theEmailIsCountedTrimmedAndInLowerCase() {
        attempts.recordFailure(" Owner@SINO.test ");

        assertThat(attempts.recordFailure(EMAIL)).isEqualTo(3);
    }

    @Test
    void eachEmailHasItsOwnCount() {
        failTimes(EMAIL, 2);

        assertThat(attempts.recordFailure("someone@else.test")).isEqualTo(4);
    }

    @Test
    void keepsAtMostTheConfiguredNumberOfEmailsAndForgetsTheOldestFirst() {
        LoginAttempts small = new LoginAttempts(clock, 2);
        small.recordFailure("a@x.test");
        clock.advance(Duration.ofSeconds(1));
        small.recordFailure("b@x.test");
        clock.advance(Duration.ofSeconds(1));
        small.recordFailure("c@x.test");

        assertThat(small.recordFailure("c@x.test")).as("c is remembered").isEqualTo(3);
        assertThat(small.recordFailure("a@x.test")).as("a, the oldest, was forgotten").isEqualTo(4);
    }

    @Test
    void aLockIsNotPushedOutByOtherEmails() {
        LoginAttempts small = new LoginAttempts(clock, 2);
        for (int i = 0; i < 5; i++) {
            small.recordFailure(EMAIL);
        }

        small.recordFailure("b@x.test");
        small.recordFailure("c@x.test");
        small.recordFailure("d@x.test");

        assertThat(small.lockedFor(EMAIL)).isPresent();
    }

    private void failTimes(String email, int times) {
        for (int i = 0; i < times; i++) {
            attempts.recordFailure(email);
        }
    }

    /** A clock the test moves forward by hand. */
    static final class MovableClock extends Clock {

        private Instant now;

        MovableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

    }

}
