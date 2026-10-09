package dev.sino.account;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import dev.sino.provider.spi.ProviderContext;

/** Other modules reach a connector through {@link ProviderAccess} and never read a token themselves (D-62). */
class ProviderAccessArchitectureTests {

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("dev.sino");

    @Test
    void onlyConnectorsReadTheCredentialsOfAContext() {
        noClasses().that().resideOutsideOfPackage("dev.sino.provider..")
                .should().callMethod(ProviderContext.class, "credentials")
                .because("a call through ProviderAccess hands the context to the connector, which alone reads it")
                .check(classes);
    }

}
