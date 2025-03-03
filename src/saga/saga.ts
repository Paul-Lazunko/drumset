import { EventEmitter } from 'events';
import { v4 } from 'uuid';
import { SagaOptions } from '@options';
import { Executor, Facts, FactsMeta } from '@parameters';
import { defaultFactsMeta, defaultSagaOptions, FactsMetaKeys } from '@const';
import { Framework, FrameworkInterface } from '@framework';
import { RoundRobinProxy, Processor } from '@node';
import { validateAddNodeParams, validateFactsMeta, validateSagaOptions } from '@helper';

export class Saga<DataType, NodeName extends string> {
  protected options: SagaOptions;
  protected eventEmitter: EventEmitter;
  protected nodes: Map<NodeName, Processor<DataType, NodeName>>;
  protected meta: Map<NodeName, FactsMeta>;
  protected framework: FrameworkInterface<DataType, NodeName>;

  constructor(sagaOptions?: SagaOptions) {
    validateSagaOptions(sagaOptions);
    this.options = sagaOptions ? { ...defaultSagaOptions, ...sagaOptions } : defaultSagaOptions;
    this.eventEmitter = new EventEmitter();
    this.nodes = new Map<NodeName, Processor<DataType, NodeName>>();
    this.meta = new Map<NodeName, any>();
    this.framework = new Framework({
      nodes: this.nodes,
      eventEmitter: this.eventEmitter,
      verbose: this.options.verbose,
      logger: this.options.logger,
      meta: this.meta,
    });
  }

  addNode(
    node: NodeName,
    executor: Executor<DataType, NodeName>,
    factsMeta: Partial<FactsMeta> = defaultFactsMeta,
    scalingFactor: number = 1,
  ) {
    validateAddNodeParams(node, executor, factsMeta, scalingFactor);
    this.nodes.set(
      node,
      new RoundRobinProxy<DataType, NodeName>({
        executor,
        framework: this.framework,
        verbose: this.options.verbose,
        logger: this.options.logger,
        scalingFactor: scalingFactor || 1,
      }),
    );
    this.meta.set(node, { ...defaultFactsMeta, ...factsMeta });
  }

  process(startNode: NodeName, data: DataType, factsMeta?: Partial<FactsMeta>) {
    if (!startNode || !this.nodes.has(startNode)) {
      throw new Error(`Node ${startNode} doesn't exist`);
    }
    if (!data) {
      throw new Error(`The "data" can't be nullable`);
    }
    validateFactsMeta(factsMeta as FactsMeta);
    const facts: Facts<DataType, NodeName> = {
      id: v4(),
      inUse: false,
      used: false,
      currentNode: startNode,
      data,
      meta: (factsMeta as FactsMeta) || this.meta.get(startNode),
    };
    return new Promise((resolve, reject) => {
      this.eventEmitter.on(facts.id, (error, facts) => {
        this.eventEmitter.removeAllListeners(facts.id);
        return error ? reject(error) : resolve(facts);
      });
      this.framework.next(startNode, facts);
    });
  }
}
