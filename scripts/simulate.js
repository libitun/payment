"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var web3_js_1 = require("@solana/web3.js");
var anchor = __importStar(require("@coral-xyz/anchor"));
var spl_token_1 = require("@solana/spl-token");
var PROGRAM_ID = new web3_js_1.PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7"); // Let's try 49yz first and if it fails, GRYw
var DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec';
var IDL = {
    address: PROGRAM_ID.toBase58(),
    metadata: { name: "solestate", version: "0.1.0", spec: "0.1.0" },
    accounts: [
        {
            name: "PropertyState",
            discriminator: [207, 94, 222, 94, 178, 10, 5, 93]
        }
    ],
    instructions: [
        {
            name: "purchaseTokensWithHistory",
            discriminator: [127, 251, 9, 12, 102, 7, 71, 36],
            accounts: [
                { name: "purchaseRecord", writable: true },
                { name: "property", writable: true },
                { name: "tokenMint", writable: true },
                { name: "buyerTokenAccount", writable: true },
                { name: "propertyVault", writable: true },
                { name: "registry", writable: true },
                { name: "buyer", writable: true, signer: true },
                { name: "tokenProgram" },
                { name: "associatedTokenProgram" },
                { name: "systemProgram" },
                { name: "rent" }
            ],
            args: [
                { name: "_id", type: "string" },
                { name: "tokenAmount", type: "u64" },
                { name: "timestamp", type: "i64" }
            ]
        }
    ]
};
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var connection, buyer, provider, program, propertyId, tokensToBuy, registryPda, propertyPda, vaultPda, propAccount, err_1, tokenMint, investorTokenAccount, timestamp, timestampBuffer, purchaseRecordPda, tx, blockhash, simulation, e_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    connection = new web3_js_1.Connection(DEVNET_RPC, 'confirmed');
                    buyer = web3_js_1.Keypair.generate();
                    provider = new anchor.AnchorProvider(connection, new anchor.Wallet(buyer), { preflightCommitment: 'confirmed' });
                    program = new anchor.Program(IDL, provider);
                    propertyId = "miami-villa-002-v3";
                    tokensToBuy = 1;
                    registryPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)[0];
                    propertyPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)], PROGRAM_ID)[0];
                    vaultPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("vault"), propertyPda.toBuffer()], PROGRAM_ID)[0];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, program.account.propertyState.fetch(propertyPda)];
                case 2:
                    // @ts-ignore
                    propAccount = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _b.sent();
                    console.error("Failed to fetch property:", err_1);
                    return [2 /*return*/];
                case 4:
                    tokenMint = propAccount.tokenMint;
                    investorTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(tokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
                    timestamp = Math.floor(Date.now() / 1000);
                    timestampBuffer = new anchor.BN(timestamp).toArrayLike(Buffer, 'le', 8);
                    purchaseRecordPda = web3_js_1.PublicKey.findProgramAddressSync([
                        Buffer.from("purchase_record"),
                        buyer.publicKey.toBuffer(),
                        propertyPda.toBuffer(),
                        timestampBuffer
                    ], PROGRAM_ID)[0];
                    return [4 /*yield*/, program.methods
                            .purchaseTokensWithHistory(propertyId, new anchor.BN(tokensToBuy), new anchor.BN(timestamp))
                            .accounts({
                            purchaseRecord: purchaseRecordPda,
                            property: propertyPda,
                            tokenMint: tokenMint,
                            buyerTokenAccount: investorTokenAccount,
                            propertyVault: vaultPda,
                            registry: registryPda,
                            buyer: buyer.publicKey,
                            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                            systemProgram: web3_js_1.SystemProgram.programId,
                            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                        })
                            .transaction()];
                case 5:
                    tx = _b.sent();
                    tx.feePayer = buyer.publicKey;
                    return [4 /*yield*/, connection.getLatestBlockhash()];
                case 6:
                    blockhash = (_b.sent()).blockhash;
                    tx.recentBlockhash = blockhash;
                    _b.label = 7;
                case 7:
                    _b.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, connection.simulateTransaction(tx, [buyer])];
                case 8:
                    simulation = _b.sent();
                    console.log("Simulation Result:", simulation.value.err);
                    console.log("Simulation Logs:\n", (_a = simulation.value.logs) === null || _a === void 0 ? void 0 : _a.join('\n'));
                    return [3 /*break*/, 10];
                case 9:
                    e_1 = _b.sent();
                    console.error(e_1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
main();
