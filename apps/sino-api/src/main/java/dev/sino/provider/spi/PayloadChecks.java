package dev.sino.provider.spi;

import static dev.sino.provider.spi.ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED;

import java.util.List;
import java.util.Map;

/**
 * Checks shared by the normalized types. Every failure is a {@code PAYLOAD_NORMALIZATION_FAILED}, and the
 * message names the field but never repeats the value.
 */
final class PayloadChecks {

    private PayloadChecks() {
    }

    static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw invalid(name + " must not be blank");
        }
        return value;
    }

    static <T> T requireValue(T value, String name) {
        if (value == null) {
            throw invalid(name + " must not be null");
        }
        return value;
    }

    static <T> List<T> copyOf(List<T> list, String name) {
        if (list == null) {
            return List.of();
        }
        // A loop, because contains(null) throws on immutable lists such as List.of().
        for (T item : list) {
            if (item == null) {
                throw invalid(name + " must not contain null");
            }
        }
        return List.copyOf(list);
    }

    static Map<String, String> copyOf(Map<String, String> map, String name) {
        if (map == null) {
            return Map.of();
        }
        for (Map.Entry<String, String> entry : map.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) {
                throw invalid(name + " must not contain null keys or values");
            }
        }
        return Map.copyOf(map);
    }

    private static ProviderException invalid(String message) {
        return new ProviderException(PAYLOAD_NORMALIZATION_FAILED, message);
    }

}
