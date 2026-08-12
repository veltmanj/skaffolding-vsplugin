import type { SpringServiceAnswers } from './springBootNewService';

export interface GeneratedTestFile {
  path: string;
  content: string;
}

export function renderGeneratedTestFiles(
  a: SpringServiceAnswers,
  appPackage: string
): GeneratedTestFile[] {
  const packagePath = appPackage.replaceAll('.', '/');
  const aggregate = a.aggregateName;
  return [
    {
      path: `src/test/resources/features/${toKebabCase(aggregate)}.feature`,
      content: renderFeature(aggregate)
    },
    javaFile(packagePath, `${aggregate}StepDefinitions`, renderStepDefinitions(a, appPackage)),
    javaFile(packagePath, 'CucumberTest', renderCucumberRunner(appPackage)),
    javaFile(packagePath, `${aggregate}ServiceTest`, renderServiceUnitTest(a, appPackage)),
    javaFile(packagePath, `${aggregate}ControllerTest`, renderControllerWebTest(a, appPackage))
  ];
}

function javaFile(packagePath: string, className: string, content: string): GeneratedTestFile {
  return {
    path: `src/test/java/${packagePath}/${className}.java`,
    content
  };
}

function renderFeature(aggregate: string): string {
  return `Feature: Manage ${aggregate}

  Scenario: Create a ${aggregate}
    Given a new ${aggregate} named "Example ${aggregate}"
    When I create the ${aggregate}
    Then the ${aggregate} is created
`;
}

function renderCucumberRunner(appPackage: string): string {
  return `package ${appPackage};

import static io.cucumber.junit.platform.engine.Constants.GLUE_PROPERTY_NAME;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "${appPackage}")
public class CucumberTest {
}
`;
}

function renderStepDefinitions(a: SpringServiceAnswers, appPackage: string): string {
  return a.stackMode === 'Reactive'
    ? renderReactiveStepDefinitions(a.aggregateName, appPackage)
    : renderBlockingStepDefinitions(a.aggregateName, appPackage);
}

function renderBlockingStepDefinitions(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

public class ${aggregate}StepDefinitions {

    private ${aggregate}Service ${variable}Service;
    private String requestedName;
    private ${aggregate} created;

    @Before
    public void setUp() {
        ${variable}Service = new ${aggregate}Service(new Test${aggregate}Repository());
    }

    @Given("a new ${aggregate} named {string}")
    public void aNew${aggregate}Named(String name) {
        requestedName = name;
    }

    @When("I create the ${aggregate}")
    public void iCreateThe${aggregate}() {
        created = ${variable}Service.create(requestedName);
    }

    @Then("the ${aggregate} is created")
    public void the${aggregate}IsCreated() {
        assertNotNull(created);
        assertEquals(requestedName, created.name());
    }

    private static final class Test${aggregate}Repository implements ${aggregate}Repository {
        private final List<${aggregate}> ${variable}s = new ArrayList<>();

        @Override
        public ${aggregate} save(${aggregate} ${variable}) {
            ${variable}s.removeIf(existing -> existing.id().equals(${variable}.id()));
            ${variable}s.add(${variable});
            return ${variable};
        }

        @Override
        public Optional<${aggregate}> findById(UUID id) {
            return ${variable}s.stream().filter(existing -> existing.id().equals(id)).findFirst();
        }

        @Override
        public List<${aggregate}> findAll() {
            return List.copyOf(${variable}s);
        }
    }
}
`;
}

function renderReactiveStepDefinitions(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

public class ${aggregate}StepDefinitions {

    private ${aggregate}Service ${variable}Service;
    private String requestedName;
    private Mono<${aggregate}> created;

    @Before
    public void setUp() {
        ${variable}Service = new ${aggregate}Service(new Test${aggregate}Repository());
    }

    @Given("a new ${aggregate} named {string}")
    public void aNew${aggregate}Named(String name) {
        requestedName = name;
    }

    @When("I create the ${aggregate}")
    public void iCreateThe${aggregate}() {
        created = ${variable}Service.create(requestedName);
    }

    @Then("the ${aggregate} is created")
    public void the${aggregate}IsCreated() {
        ${aggregate} created${aggregate} = created.block();
        assertNotNull(created${aggregate});
        assertEquals(requestedName, created${aggregate}.name());
    }

    private static final class Test${aggregate}Repository implements ${aggregate}Repository {
        private final Map<UUID, ${aggregate}> ${variable}s = new LinkedHashMap<>();

        @Override
        public Mono<${aggregate}> save(${aggregate} ${variable}) {
            ${variable}s.put(${variable}.id(), ${variable});
            return Mono.just(${variable});
        }

        @Override
        public Mono<${aggregate}> findById(UUID id) {
            return Mono.justOrEmpty(${variable}s.get(id));
        }

        @Override
        public Flux<${aggregate}> findAll() {
            return Flux.fromIterable(${variable}s.values());
        }
    }
}
`;
}

function renderServiceUnitTest(a: SpringServiceAnswers, appPackage: string): string {
  return a.stackMode === 'Reactive'
    ? renderReactiveServiceUnitTest(a.aggregateName, appPackage)
    : renderBlockingServiceUnitTest(a.aggregateName, appPackage);
}

function renderControllerWebTest(a: SpringServiceAnswers, appPackage: string): string {
  return a.stackMode === 'Reactive'
    ? renderReactiveControllerWebTest(a.aggregateName, appPackage)
    : renderBlockingControllerWebTest(a.aggregateName, appPackage);
}

function renderBlockingControllerWebTest(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  const route = `/${variable}s/{id}`;
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.web.${aggregate}Controller;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(${aggregate}Controller.class)
class ${aggregate}ControllerTest {

    @Autowired
    private MockMvc client;

    @MockBean
    private ${aggregate}Service ${variable}Service;

    @Test
    void serializes_an_${toSnakeCase(aggregate)}_response_as_json() throws Exception {
        UUID id = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
        given(${variable}Service.get(id)).willReturn(Optional.of(new ${aggregate}(id, "Example ${aggregate}")));

        client.perform(get("${route}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id.toString()))
            .andExpect(jsonPath("$.name").value("Example ${aggregate}"));
    }
}
`;
}

function renderReactiveControllerWebTest(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  const route = `/${variable}s/{id}`;
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.web.${aggregate}Controller;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import static org.mockito.BDDMockito.given;

@WebFluxTest(${aggregate}Controller.class)
class ${aggregate}ControllerTest {

    @Autowired
    private WebTestClient client;

    @MockBean
    private ${aggregate}Service ${variable}Service;

    @Test
    void serializes_an_${toSnakeCase(aggregate)}_response_as_json() {
        UUID id = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
        given(${variable}Service.get(id)).willReturn(Mono.just(new ${aggregate}(id, "Example ${aggregate}")));

        client.get()
            .uri("${route}", id)
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.id").isEqualTo(id.toString())
            .jsonPath("$.name").isEqualTo("Example ${aggregate}");
    }
}
`;
}

function renderBlockingServiceUnitTest(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ${aggregate}ServiceTest {

    @Test
    void creates_an_${toSnakeCase(aggregate)}_with_the_requested_name() {
        ${aggregate}Service service = new ${aggregate}Service(new Test${aggregate}Repository());

        ${aggregate} created = service.create("Example ${aggregate}");

        assertEquals("Example ${aggregate}", created.name());
    }

    private static final class Test${aggregate}Repository implements ${aggregate}Repository {
        private final List<${aggregate}> ${variable}s = new ArrayList<>();

        @Override
        public ${aggregate} save(${aggregate} ${variable}) {
            ${variable}s.add(${variable});
            return ${variable};
        }

        @Override
        public Optional<${aggregate}> findById(UUID id) {
            return ${variable}s.stream().filter(existing -> existing.id().equals(id)).findFirst();
        }

        @Override
        public List<${aggregate}> findAll() {
            return List.copyOf(${variable}s);
        }
    }
}
`;
}

function renderReactiveServiceUnitTest(aggregate: string, appPackage: string): string {
  const variable = variableName(aggregate);
  return `package ${appPackage};

import ${appPackage}.application.${aggregate}Service;
import ${appPackage}.domain.${aggregate};
import ${appPackage}.domain.${aggregate}Repository;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ${aggregate}ServiceTest {

    @Test
    void creates_an_${toSnakeCase(aggregate)}_with_the_requested_name() {
        ${aggregate}Service service = new ${aggregate}Service(new Test${aggregate}Repository());

        Mono<${aggregate}> created = service.create("Example ${aggregate}");

        ${aggregate} created${aggregate} = created.block();
        assertNotNull(created${aggregate});
        assertEquals("Example ${aggregate}", created${aggregate}.name());
    }

    private static final class Test${aggregate}Repository implements ${aggregate}Repository {
        private final Map<UUID, ${aggregate}> ${variable}s = new LinkedHashMap<>();

        @Override
        public Mono<${aggregate}> save(${aggregate} ${variable}) {
            ${variable}s.put(${variable}.id(), ${variable});
            return Mono.just(${variable});
        }

        @Override
        public Mono<${aggregate}> findById(UUID id) {
            return Mono.justOrEmpty(${variable}s.get(id));
        }

        @Override
        public Flux<${aggregate}> findAll() {
            return Flux.fromIterable(${variable}s.values());
        }
    }
}
`;
}

function variableName(typeName: string): string {
  return typeName.charAt(0).toLowerCase() + typeName.slice(1);
}

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
