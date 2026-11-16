package dev.sino.sticker.infrastructure;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import dev.sino.sticker.StickerStats;

/** {@link StickerStats} over table {@code sticker}: the size of each picture is kept beside it, so no bytes are read. */
@Component
class JdbcStickerStats implements StickerStats {

    private final JdbcClient jdbc;

    JdbcStickerStats(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long storedBytes(UUID ownerId) {
        return jdbc.sql("SELECT coalesce(sum(size_bytes), 0) FROM sticker WHERE user_id = :owner")
                .param("owner", ownerId).query(Long.class).single();
    }

}
