import type { Context } from "../context";
import { Resource } from "../resource.ts";
import { isCloudflareApiError } from "./api-error.ts";
import { extractCloudflareResult } from "./api-response.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import type { Tunnel } from "./tunnel.ts";

export interface VpcServiceProps extends CloudflareApiOptions {
  name?: string;
  tcpPort?: number;
  appProtocol?: string;
  httpPort?: number;
  httpsPort?: number;
  host:
    | VpcService.IPv4Host
    | VpcService.IPv6Host
    | VpcService.DualStackHost
    | VpcService.HostnameHost;
  adopt?: boolean;
}

export declare namespace VpcService {
  export type Host = IPv4Host | IPv6Host | DualStackHost | HostnameHost;

  export interface IPv4Host {
    ipv4: string;
    network: Network;
  }

  export interface IPv6Host {
    ipv6: string;
    network: Network;
  }

  export interface DualStackHost {
    ipv4: string;
    ipv6: string;
    network: Network;
  }

  export type Network = { tunnelId: string } | { tunnel: Tunnel };

  export interface HostnameHost {
    hostname: string;
    resolverNetwork: Network & { resolverIps?: string[] };
  }
}

export type VpcService = Omit<VpcServiceProps, "name" | "adopt"> & {
  name: string;
  serviceId: string;
  createdAt: number;
  updatedAt: number;
  type: "vpc_service";
};

export const VpcService = Resource(
  "cloudflare::VpcService",
  async function (
    this: Context<VpcService>,
    id: string,
    props: VpcServiceProps,
  ): Promise<VpcService> {
    const api = await createCloudflareApi(props);
    if (this.phase === "delete") {
      await deleteService(api, this.output.serviceId);
      return this.destroy();
    }
    const input: ConnectivityService.Input = {
      name: props.name ?? this.scope.createPhysicalName(id),
      type: "http",
      tcp_port: props.tcpPort,
      app_protocol: props.appProtocol,
      http_port: props.httpPort,
      https_port: props.httpsPort,
      host: normalizeHost(props.host),
    };
    switch (this.phase) {
      case "create": {
        const adopt = props.adopt ?? this.scope.adopt;
        const service = await createService(api, input).catch(async (err) => {
          if (isCloudflareApiError(err, { code: 5101 }) && adopt) {
            const services = await listServices(api);
            const service = services.find((s) => s.name === input.name);
            if (service) {
              return await updateService(api, service.service_id, input);
            }
          }
          throw err;
        });
        return formatOutput(service);
      }
      case "update": {
        const service = await updateService(api, this.output.serviceId, input);
        return formatOutput(service);
      }
    }

    function normalizeHost(host: VpcService.Host): ConnectivityService.Host {
      if ("hostname" in host) {
        return {
          hostname: host.hostname,
          resolver_network: normalizeNetwork(host.resolverNetwork),
        };
      }
      return {
        ...host,
        network: normalizeNetwork(host.network),
      };
    }

    function normalizeNetwork<T extends VpcService.Network>(
      network: T,
    ): ConnectivityService.Network {
      if ("tunnelId" in network) {
        const { tunnelId, ...rest } = network;
        return { tunnel_id: network.tunnelId, ...rest };
      }
      const { tunnel, ...rest } = network;
      return { tunnel_id: tunnel.tunnelId, ...rest };
    }

    function formatOutput(service: ConnectivityService): VpcService {
      return {
        name: service.name,
        serviceId: service.service_id,
        tcpPort: service.tcp_port,
        appProtocol: service.app_protocol,
        httpPort: service.http_port,
        httpsPort: service.https_port,
        host:
          "hostname" in service.host
            ? {
                hostname: service.host.hostname,
                resolverNetwork: {
                  tunnelId: service.host.resolver_network.tunnel_id,
                  resolverIps: service.host.resolver_network.resolver_ips,
                },
              }
            : {
                ...service.host,
                network: { tunnelId: service.host.network.tunnel_id },
              },
        createdAt: new Date(service.created_at).getTime(),
        updatedAt: new Date(service.updated_at).getTime(),
        type: "vpc_service",
      };
    }
  },
);

export async function createService(
  api: CloudflareApi,
  body: ConnectivityService.Input,
): Promise<ConnectivityService> {
  return await extractCloudflareResult<ConnectivityService>(
    `create connectivity service`,
    api.post(
      `/accounts/${api.accountId}/connectivity/directory/services`,
      body,
    ),
  );
}

export async function deleteService(
  api: CloudflareApi,
  serviceId: string,
): Promise<void> {
  await extractCloudflareResult(
    `delete connectivity service "${serviceId}"`,
    api.delete(
      `/accounts/${api.accountId}/connectivity/directory/services/${serviceId}`,
    ),
  ).catch((err) => {
    if (!isCloudflareApiError(err, { status: 404 })) {
      throw err;
    }
  });
}

export async function getService(
  api: CloudflareApi,
  serviceId: string,
): Promise<ConnectivityService> {
  return await extractCloudflareResult<ConnectivityService>(
    `get connectivity service "${serviceId}"`,
    api.get(
      `/accounts/${api.accountId}/connectivity/directory/services/${serviceId}`,
    ),
  );
}

export async function listServices(
  api: CloudflareApi,
): Promise<ConnectivityService[]> {
  return await extractCloudflareResult<ConnectivityService[]>(
    `list connectivity services`,
    api.get(
      `/accounts/${api.accountId}/connectivity/directory/services?per_page=1000`,
    ),
  );
}

export async function updateService(
  api: CloudflareApi,
  serviceId: string,
  body: ConnectivityService.Input,
): Promise<ConnectivityService> {
  return await extractCloudflareResult<ConnectivityService>(
    `update connectivity service "${serviceId}"`,
    api.put(
      `/accounts/${api.accountId}/connectivity/directory/services/${serviceId}`,
      body,
    ),
  );
}

interface ConnectivityService extends ConnectivityService.Input {
  service_id: string;
  created_at: string;
  updated_at: string;
}

declare namespace ConnectivityService {
  export interface Input {
    name: string;
    type: "http";
    tcp_port?: number;
    app_protocol?: string;
    http_port?: number;
    https_port?: number;
    host: Host;
  }

  export type Host = IPv4Host | IPv6Host | DualStackHost | HostnameHost;

  export interface IPv4Host {
    ipv4: string;
    network: Network;
  }

  export interface IPv6Host {
    ipv6: string;
    network: Network;
  }

  export interface DualStackHost {
    ipv4: string;
    ipv6: string;
    network: Network;
  }

  export interface Network {
    tunnel_id: string;
  }

  export interface HostnameHost {
    hostname: string;
    resolver_network: ResolverNetwork;
  }

  export interface ResolverNetwork extends Network {
    resolver_ips?: string[];
  }
}
