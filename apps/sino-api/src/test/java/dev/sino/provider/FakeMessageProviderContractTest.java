package dev.sino.provider;

import static dev.sino.provider.FakeMessageProvider.message;
import static dev.sino.provider.FakeMessageProvider.messageWithoutSentAt;
import static dev.sino.provider.ProviderCapability.PUSH_WEBHOOK;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_IMAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.OutgoingImage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

class FakeMessageProviderContractTest {

    private static final ProviderContext CONTEXT = new ProviderContext(UUID.randomUUID(), "fake-account",
            new TokenCredentials("fake-secret-token"));
    private static final Instant SEPTEMBER = Instant.parse("2026-09-01T08:00:00Z");
    private static final Instant OCTOBER = Instant.parse("2026-10-01T08:00:00Z");
    private static final Instant BETWEEN = Instant.parse("2026-09-15T00:00:00Z");
    private static final SendMessageCommand PICTURE = new SendMessageCommand("c-1", ConversationType.DIRECT, null, null,
            List.of(), UUID.randomUUID(), null, new OutgoingImage(new byte[] {1, 2, 3}, "image/png", "sticker.png", 64, 64));

    @Nested
    class ReadOnly extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1", SEPTEMBER), message("m-2", OCTOBER))
                .estimate(2)
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return FakeMessageProvider.builder("fake")
                    .page(message("m-1"), messageWithoutSentAt("m-2"), message("m-3"))
                    .build();
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of("m-1", "m-2");
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

        @Test
        void aRefusedSendNeverReachesTheProvider() {
            assertThatExceptionOfType(ProviderException.class)
                    .isThrownBy(() -> provider.sendMessage(CONTEXT,
                            new SendMessageCommand("c-1", "hi", null, List.of(), UUID.randomUUID(), null)));
            assertThat(provider.sentMessages()).isEmpty();
        }

    }

    // A connector that sends pictures too: the kit's picture checks that run only with SEND_IMAGES run on it.
    @Nested
    class SendingPictures extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-chat")
                .capabilities(SEND_MESSAGES, SEND_IMAGES)
                .page(message("m-1"))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return provider;
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of();
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

    }

    // A connector that only sends: the kit's checks that reading and estimating are refused without READ_MESSAGES
    // run on it, even with an estimate configured.
    @Nested
    class SendOnly extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-sender")
                .capabilities(SEND_MESSAGES)
                .page(message("m-1"))
                .estimate(5)
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return provider;
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of();
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

    }

    @Nested
    class Sending extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-mail")
                .displayName("Fake Mail")
                .capabilities(READ_MESSAGES, SEND_MESSAGES)
                .page(message("m-1", OCTOBER), message("m-2", SEPTEMBER))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return FakeMessageProvider.builder("fake-mail")
                    .capabilities(READ_MESSAGES, SEND_MESSAGES)
                    .page(messageWithoutSentAt("m-1"), message("m-2"), message("m-3"))
                    .build();
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of("m-1", "m-2");
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

    }

    // A connector that tells Sino of changes: the kit's check of a registration runs on it.
    @Nested
    class Push extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-push")
                .page(message("m-1", SEPTEMBER), message("m-2", OCTOBER))
                .push("fake-account@fake.test", Instant.now().plus(7, ChronoUnit.DAYS))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return FakeMessageProvider.builder("fake-push")
                    .page(message("m-1"), messageWithoutSentAt("m-2"), message("m-3"))
                    .build();
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of("m-1", "m-2");
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

        @Test
        void declaresPushNextToWhatItWasGiven() {
            assertThat(provider.capabilities().values()).containsExactly(READ_MESSAGES, PUSH_WEBHOOK);
        }

    }

    @Test
    void withoutPushTheProviderNeverHearsOfARegistration() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).build();

        assertThat(provider.registerPush(CONTEXT)).isEmpty();
        assertThat(provider.pushCalls()).isZero();
    }

    @Test
    void registersForPushAsOftenAsAsked() {
        Instant expiresAt = Instant.parse("2026-10-17T08:00:00Z");
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").push("fake@fake.test", expiresAt).build();

        assertThat(provider.registerPush(CONTEXT)).hasValue(new PushRegistration("fake@fake.test", expiresAt));
        assertThat(provider.registerPush(CONTEXT)).isPresent();
        assertThat(provider.pushCalls()).isEqualTo(2);
    }

    @Test
    void aRegistrationForPushCanFail() {
        ProviderException refused = new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no such topic");
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").pushFailure(refused).build();

        assertThat(provider.capabilities().supports(PUSH_WEBHOOK)).isTrue();
        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> provider.registerPush(CONTEXT))
                .isSameAs(refused);
        assertThat(provider.pushCalls()).isEqualTo(1);
    }

    @Test
    void followsItsPages() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1"))
                .page(message("m-2"))
                .build();

        SyncBatch first = provider.fetchUpdates(CONTEXT, SyncCursor.initial());
        SyncBatch second = provider.fetchUpdates(CONTEXT, first.nextCursor());
        SyncBatch afterTheEnd = provider.fetchUpdates(CONTEXT, second.nextCursor());

        assertThat(first.hasMore()).isTrue();
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-2");
        assertThat(second.hasMore()).isFalse();
        assertThat(afterTheEnd.messages()).isEmpty();
        assertThat(afterTheEnd.nextCursor()).isEqualTo(second.nextCursor());
    }

    @Test
    void leavesOutOlderMessagesOnEveryPageOfTheFirstSync() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1", SEPTEMBER), message("m-2", OCTOBER))
                .page(message("m-3", SEPTEMBER), message("m-4", BETWEEN), messageWithoutSentAt("m-5"))
                .build();

        SyncBatch first = provider.fetchUpdates(CONTEXT, SyncCursor.initial(BETWEEN));
        SyncBatch second = provider.fetchUpdates(CONTEXT, first.nextCursor());
        SyncBatch afterTheEnd = provider.fetchUpdates(CONTEXT, second.nextCursor());

        assertThat(first.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-2");
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-4");
        assertThat(second.skipped()).extracting(SkippedItem::externalId).containsExactly("m-5");
        assertThat(afterTheEnd.nextCursor()).isEqualTo(second.nextCursor());
    }

    @Test
    void estimatesWhatItWasGivenWhateverTheMoment() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).estimate(1180).build();

        assertThat(provider.estimateMessages(CONTEXT, null)).hasValue(1180);
        assertThat(provider.estimateMessages(CONTEXT, BETWEEN)).hasValue(1180);
    }

    @Test
    void estimatesNothingWhenNotGivenAnEstimate() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).build();

        assertThat(provider.estimateMessages(CONTEXT, null)).isEmpty();
    }

    @Test
    void failsTheCallsItWasToldToFailAndAnswersTheOthers() {
        ProviderException throttled = ProviderException.rateLimited("slow down", null);
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).page(message("m-2"))
                .failOnCall(2, throttled).build();

        SyncBatch first = provider.fetchUpdates(CONTEXT, SyncCursor.initial());
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider.fetchUpdates(CONTEXT, first.nextCursor())).isSameAs(throttled);
        SyncBatch second = provider.fetchUpdates(CONTEXT, first.nextCursor());

        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-2");
        assertThat(provider.fetchCalls()).isEqualTo(3);
    }

    @Test
    void aPictureNeverReachesAProviderThatCannotSendPictures() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").capabilities(SEND_MESSAGES).build();

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> provider.sendMessage(CONTEXT, PICTURE))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
        assertThat(provider.sentMessages()).isEmpty();
    }

    @Test
    void aProviderThatSendsPicturesGetsThePictureAsGiven() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").capabilities(SEND_MESSAGES, SEND_IMAGES)
                .build();

        provider.sendMessage(CONTEXT, PICTURE);

        assertThat(provider.sentMessages()).singleElement().satisfies(command ->
                assertThat(command.image()).isEqualTo(PICTURE.image()));
    }

    @Test
    void anEstimateCanFail() {
        ProviderException unreachable = new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down");
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").estimate(5).estimateFailure(unreachable)
                .build();

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> provider.estimateMessages(CONTEXT, null))
                .isSameAs(unreachable);
    }

    @Test
    void rejectsACursorItDidNotIssue() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).build();

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider.fetchUpdates(CONTEXT, new SyncCursor("page-1@yesterday")))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
    }

}
