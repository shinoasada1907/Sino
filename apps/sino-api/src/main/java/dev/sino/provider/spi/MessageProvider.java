package dev.sino.provider.spi;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;

/**
 * What a provider connector implements. Callers check {@link #capabilities()} before calling an operation
 * (FR-06) and never call a connector inside a database transaction.
 */
public interface MessageProvider {

    ProviderType type();

    /** Name shown to users, for example {@code Gmail}; defaults to the type. */
    default String displayName() {
        return type().value();
    }

    /** Only what the connector really supports. */
    ProviderCapabilities capabilities();

    /** Who the connected account is; {@code externalAccountId} is stable between calls. */
    AccountProfile getAccountProfile(ProviderContext context);

    /** Changes after {@code cursor}; {@link SyncCursor#initial()} asks for the first sync. */
    SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor);

    /**
     * Roughly how many messages a first sync from {@code since} would bring ({@code null}: the whole account), or
     * empty when the connector cannot tell (D-65). Never negative, and only an estimate: a caller never uses it to
     * decide when a sync is done. Empty by default, and always for a connector without
     * {@link ProviderCapability#READ_MESSAGES}, which never calls its provider for it.
     */
    default OptionalLong estimateMessages(ProviderContext context, Instant since) {
        return OptionalLong.empty();
    }

    /**
     * How the connector is connected over OAuth2, or empty when it is not (D-38). A connector never exchanges a
     * code or refreshes a token itself: the {@code account} module does (D-15 = A').
     */
    default Optional<OAuth2Connection> oauth2() {
        return Optional.empty();
    }

    /**
     * Only for connectors that declare {@link ProviderCapability#SEND_MESSAGES}. A failure that leaves the message
     * certainly unsent has its usual code; one after which the provider may have sent it has
     * {@link ProviderErrorCode#OUTCOME_UNKNOWN} (D-135), and the caller must not send again blindly.
     */
    default SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                type() + " does not support " + ProviderCapability.SEND_MESSAGES);
    }

    /**
     * The provider's IDs of the messages that may be the one Sino sent with {@code command}, the send having started
     * at {@code startedAt} (F10, D-132), for a send whose outcome was unknown: the likeliest first, empty when the
     * provider has none. More than one can match, such as the same text sent twice, so the caller takes the first that
     * no other message of Sino holds. A connector that cannot tell must not answer empty, or a message that went out
     * would be offered to be sent again.
     *
     * @throws ProviderException with {@code CAPABILITY_NOT_SUPPORTED} by default, without calling the provider
     */
    default List<String> findSentMessages(ProviderContext context, SendMessageCommand command, Instant startedAt) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                type() + " cannot find a message it sent");
    }

    /**
     * Reads one message again for its content (F06, D-122), or empty when the connector cannot or the provider no
     * longer has that message. Empty by default, without calling the provider.
     */
    default Optional<MessageContent> fetchMessageContent(ProviderContext context, String externalMessageId) {
        return Optional.empty();
    }

    /**
     * The content of one attachment of a message (F06, D-125), by the external IDs of both.
     *
     * @throws ProviderException with {@code CAPABILITY_NOT_SUPPORTED} by default, without calling the provider
     */
    default AttachmentContent fetchAttachment(ProviderContext context, String externalMessageId,
            String externalAttachmentId) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                type() + " cannot download an attachment");
    }

    /**
     * Asks the provider to notify Sino of changes to the account (D-76), or renews that while it is on; where the
     * notices go is the connector's own setup. Empty by default, and always for a connector without
     * {@link ProviderCapability#PUSH_WEBHOOK}, which never calls its provider for it.
     */
    default Optional<PushRegistration> registerPush(ProviderContext context) {
        return Optional.empty();
    }

}
