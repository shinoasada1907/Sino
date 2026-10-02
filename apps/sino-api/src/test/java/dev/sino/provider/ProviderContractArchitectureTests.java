package dev.sino.provider;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

class ProviderContractArchitectureTests {

    private static final String[] CONTRACT_PACKAGES = { "dev.sino.provider", "dev.sino.provider.spi" };

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("dev.sino.provider");

    @Test
    void theContractDoesNotDependOnConnectors() {
        noClasses().that().resideInAnyPackage(CONTRACT_PACKAGES)
                .should().dependOnClassesThat().resideInAnyPackage("dev.sino.provider.infrastructure..")
                .check(classes);
    }

    @Test
    void theContractUsesOnlySinoAndJavaTypes() {
        // org.springframework.modulith comes from @NamedInterface on the spi package.
        classes().that().resideInAnyPackage(CONTRACT_PACKAGES)
                .should().onlyDependOnClassesThat()
                .resideInAnyPackage("java..", "dev.sino..", "org.springframework.modulith..")
                .check(classes);
    }

}
