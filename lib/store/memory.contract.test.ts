// 인메모리 구현 — CI에서 항상 돈다
import { InMemoryStore } from "./memory";
import { storeContractTests } from "./store-contract";

storeContractTests("memory", async () => new InMemoryStore());
