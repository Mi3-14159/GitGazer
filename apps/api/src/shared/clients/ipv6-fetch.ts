import {setDefaultResultOrder} from 'node:dns';

/**
 * Configures DNS resolution to prefer IPv6 addresses.
 * Call once at Lambda cold start so all outbound connections
 * (including the external AWS SDK) route through the Egress-Only
 * Internet Gateway instead of requiring a NAT Gateway.
 */
export const enableGlobalIpv6 = () => {
    setDefaultResultOrder('ipv6first');
};
