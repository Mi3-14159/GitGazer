/**
 * Lambda bootstrap — runs once at cold start before any handler invocation.
 * Sets DNS resolution to prefer IPv6, routing external traffic
 * through the Egress-Only Internet Gateway (no NAT Gateway needed).
 */
import {enableGlobalIpv6} from '@/shared/clients/ipv6-fetch';

enableGlobalIpv6();
