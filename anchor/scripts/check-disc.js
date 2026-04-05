const crypto = require('crypto');

function getDiscriminator(name) {
    const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
    return Array.from(hash.slice(0, 8));
}

const instructions = [
    'purchase_tokens',
    'purchase_tokens_with_history',
    'create_sale_listing',
    'cancel_sale_listing',
    'execute_sale',
    'list_property',
    'initialize_registry',
    'initialize_treasury',
    'create_property_metadata'
];

console.log("Dscriminators (global:[name]):");
instructions.forEach(ix => {
    console.log(`${ix}: [${getDiscriminator(ix).join(', ')}]`);
});

const accounts = [
    'Property',
    'Registry',
    'SaleListing',
    'PurchaseRecord'
];

console.log("\nAccount Discriminators (account:[name]):");
accounts.forEach(acc => {
    const hash = crypto.createHash('sha256').update(`account:${acc}`).digest();
    const disc = Array.from(hash.slice(0, 8));
    console.log(`${acc}: [${disc.join(', ')}]`);
});
