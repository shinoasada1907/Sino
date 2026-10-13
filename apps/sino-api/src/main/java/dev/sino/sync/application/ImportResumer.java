package dev.sino.sync.application;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * Goes on with the imports that were running when the application stopped (spec "Nhập tiếp sau khi khởi động lại"),
 * from their saved cursor. One backend process is assumed (MVP); several would need a lease per account (F07).
 */
@Component
public class ImportResumer {

    private static final Logger log = LoggerFactory.getLogger(ImportResumer.class);

    private final SyncCheckpoints checkpoints;
    private final ImportRunner runner;

    ImportResumer(SyncCheckpoints checkpoints, ImportRunner runner) {
        this.checkpoints = checkpoints;
        this.runner = runner;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeRunning() {
        List<UUID> running = checkpoints.running();
        if (!running.isEmpty()) {
            log.info("Going on with {} initial syncs that were running", running.size());
        }
        running.forEach(runner::submit);
    }

}
