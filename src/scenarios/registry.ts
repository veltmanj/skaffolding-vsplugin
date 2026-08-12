import { createAzureDeploymentStarterScenario } from './azureDeploymentStarter';
import { loadScenarioPackScenarios } from './scenarioPackRuntime';
import { createSpringBootServiceScenario } from './springBootNewService';
import { addSpringSecurityConfigScenario } from './springSecurityConfig';
import { Scenario } from './types';

const builtInScenarios: Scenario[] = [
  createSpringBootServiceScenario,
  addSpringSecurityConfigScenario,
  createAzureDeploymentStarterScenario
];

export async function getScenarios(): Promise<Scenario[]> {
  const packScenarios = await loadScenarioPackScenarios();
  return [...builtInScenarios, ...packScenarios];
}

export async function getScenarioById(id: string): Promise<Scenario | undefined> {
  const scenarios = await getScenarios();
  return scenarios.find((scenario) => scenario.id === id);
}
