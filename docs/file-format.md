# .thf File Format Specification

Threat Forge uses .thf files to store threat models in YAML.

## Schema

version: number
name: string
description: string (optional)
components:
  - id: string
    name: string
    type: string
    trustBoundary: string (optional)
dataFlows:
  - id: string
    name: string
    source: string (component id)
    target: string (component id)
    protocol: string (optional)
threats:
  - id: string
    name: string
    description: string
    severity: low|medium|high
    mitigation: string (optional)

## Example

# Example: Payment Processing threat model
version: 1
name: Payment Processing
description: Handles credit card transactions
components:
  - id: api-gw
    name: API Gateway
    type: API Gateway
    trustBoundary: dmz
  - id: payment-db
    name: Payment DB
    type: Database
    trustBoundary: internal
dataFlows:
  - id: flow-1
    name: Process Payment
    source: api-gw
    target: payment-db
    protocol: HTTPS
threats:
  - id: threat-1
    name: SQL Injection
    description: Malicious input in payment query
    severity: high
    mitigation: Use parameterized queries

## Version Compatibility

- Version 1: Initial release, supported in Threat Forge v1.0.0+