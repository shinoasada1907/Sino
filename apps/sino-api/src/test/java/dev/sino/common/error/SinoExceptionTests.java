package dev.sino.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class SinoExceptionTests {

    enum TestCode implements ErrorCode {

        SLOW_DOWN;

        @Override
        public ErrorCategory category() {
            return ErrorCategory.RATE_LIMITED;
        }

    }

    @Test
    void carriesExtraMembersForTheProblemResponse() {
        SinoException failure = new SinoException(TestCode.SLOW_DOWN, "Slow down.", Map.of("retryAfterSeconds", 30L));

        assertThat(failure.properties()).containsEntry("retryAfterSeconds", 30L);
    }

    @Test
    void hasNoExtraMembersByDefault() {
        assertThat(new SinoException(TestCode.SLOW_DOWN, "Slow down.").properties()).isEmpty();
    }

    @Test
    void cannotOverrideAStandardMemberOfTheProblemResponse() {
        for (String reserved : new String[] { "type", "title", "status", "detail", "instance", "code" }) {
            assertThatThrownBy(() -> new SinoException(TestCode.SLOW_DOWN, "x", Map.of(reserved, "y")))
                    .as(reserved).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void keepsItsOwnCopyOfTheMembers() {
        Map<String, Object> members = new HashMap<>(Map.of("remainingAttempts", 4));
        SinoException failure = new SinoException(TestCode.SLOW_DOWN, "x", members);

        members.put("remainingAttempts", 0);

        assertThat(failure.properties()).containsEntry("remainingAttempts", 4);
    }

}
