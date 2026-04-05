const crypto = require('crypto');
function getDiscriminator(name) {
    const hash = crypto.createHash('sha256').update('global:' + name).digest();
    return Array.from(hash.slice(0, 8));
}
console.log('execute_sale:', getDiscriminator('execute_sale'));
console.log('cancel_sale_listing:', getDiscriminator('cancel_sale_listing'));
