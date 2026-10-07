package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import dev.sino.identity.infrastructure.AppUserRepository;

class OwnerCurrentUserTests {

    private static final UUID OWNER_ID = UUID.fromString("0192f0a0-0000-7000-8000-000000000001");

    private final AppUserRepository users = mock(AppUserRepository.class);
    private final OwnerCurrentUser currentUser = new OwnerCurrentUser(users,
            new OwnerProperties("owner@sino.test", "Owner"));

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void anAuthenticatedCallerIsTheOwner() {
        given(users.findIdByEmail("owner@sino.test")).willReturn(Optional.of(OWNER_ID));
        authenticate(new TestingAuthenticationToken("test-user", "test-password", "ROLE_API"));

        assertThat(currentUser.requireOwnerId()).isEqualTo(OWNER_ID);
    }

    @Test
    void looksTheOwnerUpOnlyOnce() {
        given(users.findIdByEmail("owner@sino.test")).willReturn(Optional.of(OWNER_ID));
        authenticate(new TestingAuthenticationToken("test-user", "test-password", "ROLE_API"));

        currentUser.requireOwnerId();
        currentUser.requireOwnerId();

        then(users).should(times(1)).findIdByEmail("owner@sino.test");
    }

    @Test
    void failsWhenNobodyIsAuthenticated() {
        assertThatThrownBy(currentUser::requireOwnerId).isInstanceOf(IllegalStateException.class);
        then(users).shouldHaveNoInteractions();
    }

    @Test
    void anAnonymousCallerIsNotTheOwner() {
        authenticate(new AnonymousAuthenticationToken("key", "anonymousUser",
                AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

        assertThatThrownBy(currentUser::requireOwnerId).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failsWhenTheOwnerHasNotBeenCreated() {
        given(users.findIdByEmail("owner@sino.test")).willReturn(Optional.empty());
        authenticate(new TestingAuthenticationToken("test-user", "test-password", "ROLE_API"));

        assertThatThrownBy(currentUser::requireOwnerId)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("owner");
    }

    private static void authenticate(Authentication authentication) {
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

}
