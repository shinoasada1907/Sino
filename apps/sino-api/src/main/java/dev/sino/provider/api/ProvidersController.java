package dev.sino.provider.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.provider.ProviderRegistry;

/**
 * Lists the providers Sino supports and what each one can do, so the frontend can adapt before any account
 * is connected (D-18).
 */
@RestController
@RequestMapping("/api/providers")
class ProvidersController {

    private final ProviderRegistry registry;

    ProvidersController(ProviderRegistry registry) {
        this.registry = registry;
    }

    /** Sorted by type, as the registry returns them. */
    @GetMapping
    List<ProviderResponse> list() {
        return registry.descriptors().stream().map(ProviderResponse::from).toList();
    }

}
