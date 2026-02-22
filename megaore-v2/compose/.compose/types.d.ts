// Type definitions for Compose host functions
// These types are automatically available in all task files without imports


	export { Contracts } from "./generated/index.ts";
	import type { ContractClasses } from "./generated/index";

	export type LogEvent = {
	  code: string;
	  message: string;
	  data: string;
	  task?: string;
	  runId?: string;
	};

	export type ContextFunctionRetryConfig = {
	  max_attempts: number;
	  initial_interval_ms: number;
	  backoff_factor: number;
	};

	export type Chain = {
	  id: number;
	  name: string;
	  testnet: boolean;
	  nativeCurrency: {
	    name: string;
	    symbol: string;
	    decimals: number;
	  };
	  rpcUrls: {
	    public: { http: string[] };
	    default: { http: string[] };
	  };
	  blockExplorers: {
	    default: { name: string; url: string };
	  };
	  contracts?: Record<string, { address: string }>;
	};

	export type ScalarIndexType = "text" | "numeric" | "boolean" | "timestamptz";

	export interface CollectionIndexSpec {
	  path: string;
	  type: ScalarIndexType;
	  unique?: boolean;
	}

	export interface FindOptions {
	  limit?: number;
	  offset?: number;
	}

	export type FilterHelper =
	  | "$gt"
	  | "$gte"
	  | "$lt"
	  | "$lte"
	  | "$in"
	  | "$ne"
	  | "$nin"
	  | "$exists";
	export type HelperValue = Partial<
	  Record<FilterHelper, string | number | boolean | string[] | number[]>
	>;
	export type FilterValue = string | number | boolean | HelperValue;
	export type Filter = Record<string, FilterValue>;

	export type WithId<T> = T & { id: string };

	export interface Collection<TDoc = unknown> {
	  readonly name: string;
	  insertOne(doc: TDoc, opts?: { id?: string }): Promise<{ id: string }>;
	  findOne(filter: Filter): Promise<WithId<TDoc> | null>;
	  findMany(filter: Filter, options?: FindOptions): Promise<Array<WithId<TDoc>>>;
	  getById(id: string): Promise<WithId<TDoc> | null>;
	  /**
	   * @param opts.upsert - Defaults to true. Set to false to throw if document doesn't exist.
	   */
	  setById(
	    id: string,
	    doc: TDoc,
	    opts?: { upsert?: boolean },
	  ): Promise<{ id: string; upserted?: boolean; matched?: number }>;
	  deleteById(id: string): Promise<{ deletedCount: number }>;
	  drop(): Promise<void>;
	}

	export type Address = `0x${string}`;
	export type Hex = `0x${string}`;

	export interface WalletConfig {
	  name?: string; // defaults to "default"
	  privateKey?: string;
	  sponsorGas?: boolean; // defaults to true if no privateKey and false if privateKey
	}

	export type ReplayOnReorg = {
	  type: "replay";
	};

	export type LogOnReorg = {
	  type: "log";
	  logLevel?: "error" | "info" | "warn"; // defaults to "error"
	};

	export type CustomReorgAction = {
	  type: "task";
	  task: string;
	};

	export type OnReorgOptions = ReplayOnReorg | LogOnReorg | CustomReorgAction;

	export type OnReorgConfig = {
	  action: OnReorgOptions;
	  depth: number;
	};

	export interface TransactionConfirmation {
	  confirmations?: number;
	  onReorg?: OnReorgConfig;
	}

	export interface IWallet {
	  readonly name: string;
	  readonly address: Address;
	  writeContract(
	    chain: Chain,
	    contractAddress: Address,
	    functionSig: string,
	    args: unknown[],
	    confirmation?: TransactionConfirmation,
	    retryConfig?: ContextFunctionRetryConfig,
	  ): Promise<{ hash: string; receipt: TransactionReceipt }>;
	  sendTransaction(
	    config: {
	      to: Address;
	      data: Hex;
	      chain: Chain;
	      value?: bigint;
	      maxFeePerGas?: bigint;
	      maxPriorityFeePerGas?: bigint;
	      gas?: bigint;
	      nonce?: number;
	    },
	    confirmation?: TransactionConfirmation,
	    retryConfig?: ContextFunctionRetryConfig,
	  ): Promise<{ hash: string; receipt: TransactionReceipt }>;
	  readContract: <T = unknown>(
	    chain: Chain,
	    contractAddress: Address,
	    functionSig: string,
	    args: unknown[],
	    retryConfig?: ContextFunctionRetryConfig,
	  ) => Promise<T>;
	  simulate: (
	    chain: Chain,
	    contractAddress: Address,
	    functionSig: string,
	    args: unknown[],
	    retryConfig?: ContextFunctionRetryConfig,
	  ) => Promise<{ hash: string }>;
	  getBalance: (
	    chain: Chain,
	    retryConfig?: ContextFunctionRetryConfig,
	  ) => Promise<string>;
	}

	export interface Log {
	  address: Address;
	  topics: `0x${string}`[];
	  data: `0x${string}`;
	  blockHash: `0x${string}`;
	  blockNumber: bigint;
	  logIndex: number;
	  transactionHash: `0x${string}`;
	  transactionIndex: number;
	  removed?: boolean;
	}

	export interface TransactionReceipt {
	  blockHash: `0x${string}`;
	  blockNumber: bigint;
	  contractAddress: Address | null;
	  cumulativeGasUsed: bigint;
	  effectiveGasPrice: bigint;
	  from: Address;
	  gasUsed: bigint;
	  logs: Log[];
	  logsBloom: `0x${string}`;
	  status: "success" | "reverted";
	  to: Address | null;
	  transactionHash: `0x${string}`;
	  transactionIndex: number;
	  type: "legacy" | "eip1559" | "eip2930" | "eip4844" | "eip7702";
	}

	export type AbiInput = {
	  name: string;
	  type: string;
	  internalType?: string;
	  indexed?: boolean;
	};

	export type AbiOutput = {
	  name: string;
	  type: string;
	  internalType?: string;
	};

	export type AbiFunction = {
	  constant?: boolean;
	  inputs: AbiInput[];
	  name: string;
	  outputs?: AbiOutput[];
	  payable?: boolean;
	  stateMutability?: "view" | "pure" | "nonpayable" | "payable";
	  type: "function";
	};

	export type AbiEvent = {
	  anonymous?: boolean;
	  inputs: AbiInput[];
	  name: string;
	  type: "event";
	};

	export type AbiConstructor = {
	  inputs: AbiInput[];
	  stateMutability?: "nonpayable" | "payable";
	  type: "constructor";
	};

	export type AbiError = {
	  inputs: AbiInput[];
	  name: string;
	  type: "error";
	};

	export type Abi = (AbiFunction | AbiEvent | AbiConstructor | AbiError)[];

	export interface OnchainEvent {
	  blockNumber: number;
	  blockHash: string;
	  transactionIndex: number;
	  removed: boolean;
	  address: string;
	  data: Hex;
	  topics: Hex[];
	  transactionHash: string;
	  logIndex: number;
	}

	export interface FetchConfig {
	  method?: string;
	  headers?: Record<string, string>;
	  body?: Record<string, unknown> | string;
	}

	export type TaskContext = {
	  env: Record<string, string>;
	  callTask: <Args = Record<string, unknown>, T = unknown>(
	    taskName: string,
	    args: Args,
	    retryConfig?: ContextFunctionRetryConfig,
	  ) => Promise<T>;
	  fetch: <T = unknown>(
	    url: string,
	    fetchConfigOrRetryConfig?: FetchConfig | ContextFunctionRetryConfig,
	    retryConfig?: ContextFunctionRetryConfig,
	  ) => Promise<T | undefined>;
	  logEvent: (event: LogEvent) => Promise<void>;
	  evm: {
	    chains: AvailableChains;
	    wallet: (config: WalletConfig) => Promise<IWallet>;
	    decodeEventLog: <T = unknown>(abi: Abi, log: OnchainEvent) => Promise<T>;
	    contracts: ContractClasses;
	  };
	  collection: <T>(
	    name: string,
	    indexes?: CollectionIndexSpec[],
	  ) => Promise<Collection<T>>;
	};



	export type AvailableChains = {
		abstract: Chain;
		abstractTestnet: Chain;
		apeChain: Chain;
		arbitrum: Chain;
		arbitrumNova: Chain;
		arbitrumSepolia: Chain;
		astar: Chain;
		avalanche: Chain;
		avalancheFuji: Chain;
		b3: Chain;
		b3Sepolia: Chain;
		base: Chain;
		basePreconf: Chain;
		baseSepolia: Chain;
		baseSepoliaPreconf: Chain;
		basecampTestnet: Chain;
		berachain: Chain;
		berachainBepolia: Chain;
		bitTorrent: Chain;
		blast: Chain;
		blastSepolia: Chain;
		bob: Chain;
		bobSepolia: Chain;
		boba: Chain;
		bobaSepolia: Chain;
		botanix: Chain;
		bsc: Chain;
		bscTestnet: Chain;
		celo: Chain;
		chiliz: Chain;
		citreaTestnet: Chain;
		confluxESpace: Chain;
		coreDao: Chain;
		corn: Chain;
		cornTestnet: Chain;
		cronos: Chain;
		curtis: Chain;
		cyber: Chain;
		darwinia: Chain;
		degen: Chain;
		dogechain: Chain;
		eduChain: Chain;
		eduChainTestnet: Chain;
		etherlink: Chain;
		fantom: Chain;
		filecoin: Chain;
		filecoinCalibration: Chain;
		flare: Chain;
		flareTestnet: Chain;
		flowMainnet: Chain;
		flowTestnet: Chain;
		fluentTestnet: Chain;
		fraxtal: Chain;
		fuse: Chain;
		gnosis: Chain;
		gnosisChiado: Chain;
		gravity: Chain;
		hedera: Chain;
		hemi: Chain;
		hoodi: Chain;
		hyperliquidEvmTestnet: Chain;
		immutableZkEvm: Chain;
		immutableZkEvmTestnet: Chain;
		ink: Chain;
		inkSepolia: Chain;
		iota: Chain;
		kaia: Chain;
		kairos: Chain;
		katana: Chain;
		kava: Chain;
		kavaTestnet: Chain;
		klaytn: Chain;
		klaytnBaobab: Chain;
		lens: Chain;
		lensTestnet: Chain;
		lightlinkPegasus: Chain;
		linea: Chain;
		lineaSepolia: Chain;
		lisk: Chain;
		liskSepolia: Chain;
		lumiaMainnet: Chain;
		lyra: Chain;
		mainnet: Chain;
		manta: Chain;
		mantaSepoliaTestnet: Chain;
		mantle: Chain;
		mantleSepoliaTestnet: Chain;
		mantraDuKongEVMTestnet: Chain;
		mantraEVM: Chain;
		merlin: Chain;
		metalL2: Chain;
		metis: Chain;
		mint: Chain;
		mode: Chain;
		monadTestnet: Chain;
		moonbaseAlpha: Chain;
		moonbeam: Chain;
		moonriver: Chain;
		morph: Chain;
		neonMainnet: Chain;
		nibiru: Chain;
		opBNB: Chain;
		opBNBTestnet: Chain;
		optimism: Chain;
		optimismSepolia: Chain;
		orderly: Chain;
		orderlySepolia: Chain;
		palm: Chain;
		palmTestnet: Chain;
		peaq: Chain;
		plasma: Chain;
		plasmaTestnet: Chain;
		plumeMainnet: Chain;
		plumeSepolia: Chain;
		polygon: Chain;
		polygonAmoy: Chain;
		polygonZkEvm: Chain;
		polygonZkEvmCardona: Chain;
		pulsechain: Chain;
		redbellyMainnet: Chain;
		redbellyTestnet: Chain;
		redstone: Chain;
		reyaNetwork: Chain;
		riseTestnet: Chain;
		ronin: Chain;
		rootstock: Chain;
		rootstockTestnet: Chain;
		sanko: Chain;
		sapphire: Chain;
		sapphireTestnet: Chain;
		scroll: Chain;
		scrollSepolia: Chain;
		sei: Chain;
		seiTestnet: Chain;
		sepolia: Chain;
		shape: Chain;
		shapeSepolia: Chain;
		shimmer: Chain;
		skaleCalypso: Chain;
		skaleCalypsoTestnet: Chain;
		skaleEuropa: Chain;
		skaleEuropaTestnet: Chain;
		somniaTestnet: Chain;
		soneium: Chain;
		soneiumMinato: Chain;
		sonic: Chain;
		sonicBlazeTestnet: Chain;
		sophon: Chain;
		sophonTestnet: Chain;
		spicy: Chain;
		story: Chain;
		storyAeneid: Chain;
		superposition: Chain;
		superseed: Chain;
		superseedSepolia: Chain;
		swan: Chain;
		swellchain: Chain;
		swellchainTestnet: Chain;
		tac: Chain;
		taiko: Chain;
		telos: Chain;
		thunderCore: Chain;
		unichain: Chain;
		unichainSepolia: Chain;
		vana: Chain;
		vanaMoksha: Chain;
		viction: Chain;
		wanchainTestnet: Chain;
		worldchain: Chain;
		worldchainSepolia: Chain;
		xLayer: Chain;
		xai: Chain;
		xaiTestnet: Chain;
		xdc: Chain;
		xdcTestnet: Chain;
		xrplevmTestnet: Chain;
		zenchainTestnet: Chain;
		zeroGMainnet: Chain;
		zeroNetwork: Chain;
		zetachain: Chain;
		zetachainAthensTestnet: Chain;
		zircuit: Chain;
		zircuitGarfieldTestnet: Chain;
		zkLinkNova: Chain;
		zkSync: Chain;
		zkSyncSepoliaTestnet: Chain;
		zksync: Chain;
		zksyncSepoliaTestnet: Chain;
		zora: Chain;
		zoraSepolia: Chain;
		zoraTestnet: Chain;
	};

