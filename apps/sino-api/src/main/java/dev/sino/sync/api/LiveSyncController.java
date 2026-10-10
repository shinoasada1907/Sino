package dev.sino.sync.api;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.CurrentUser;
import dev.sino.sync.application.LiveSyncService;
import dev.sino.sync.application.LiveSyncService.LiveSyncStatus;

/**
 * "Đồng bộ ngay" and where the syncs of an imported account stand (F07). An account that is not the caller's, or
 * removed, is a 404.
 */
@RestController
@RequestMapping("/api/accounts/{id}/sync")
class LiveSyncController {

    private final LiveSyncService liveSync;
    private final CurrentUser currentUser;

    LiveSyncController(LiveSyncService liveSync, CurrentUser currentUser) {
        this.liveSync = liveSync;
        this.currentUser = currentUser;
    }

    /** 202: the sync runs in the background; the body is where the syncs stood when it was asked for. */
    @PostMapping
    ResponseEntity<LiveSyncStatus> syncNow(@PathVariable UUID id) {
        return ResponseEntity.accepted().body(liveSync.syncNow(currentUser.requireOwnerId(), id));
    }

    @GetMapping
    LiveSyncStatus status(@PathVariable UUID id) {
        return liveSync.status(currentUser.requireOwnerId(), id);
    }

}
