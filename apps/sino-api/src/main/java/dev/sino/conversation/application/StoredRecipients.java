package dev.sino.conversation.application;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import dev.sino.conversation.application.InboxMessage.Address;
import tools.jackson.databind.json.JsonMapper;

/** The addressees as the store keeps them ({@code message.recipients}); a key added later is skipped. */
@JsonIgnoreProperties(ignoreUnknown = true)
record StoredRecipients(List<Address> to, List<Address> cc, List<Address> replyTo) {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    /** Null when Sino does not know the addressees (stored before BE-54, or the connector cannot tell). */
    static StoredRecipients parse(String json) {
        return json == null ? null : JSON.readValue(json, StoredRecipients.class);
    }

}
