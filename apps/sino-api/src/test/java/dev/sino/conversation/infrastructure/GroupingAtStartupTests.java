package dev.sino.conversation.infrastructure;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

/** The mail stored before groups existed is grouped when Sino starts (F05b, D-180). */
class GroupingAtStartupTests {

    private final ThreadGroups groups = mock(ThreadGroups.class);

    @Test
    void groupsEverythingStored() {
        new GroupingAtStartup(groups).groupAll();

        verify(groups).groupAll();
    }

    // Groups are only how the inbox shows threads: Sino starts without them, and the next stores group again.
    @Test
    void aFailureDoesNotStopSino() {
        doThrow(new DataAccessResourceFailureException("database gone")).when(groups).groupAll();

        assertThatNoException().isThrownBy(() -> new GroupingAtStartup(groups).groupAll());
    }

}
