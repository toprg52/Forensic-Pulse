import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { Account, Transaction, FraudRing } from '../data/mockData';
import type { SimulationResult } from '../api';
import clsx from 'clsx';
import { Maximize2 } from 'lucide-react';

interface NetworkGraphProps {
  accounts: Account[];
  transactions: Transaction[];
  rings: FraudRing[];
  onNodeClick: (accountId: string) => void;
  selectedAccountId?: string;
  simulationResult?: SimulationResult | null;
}

export function NetworkGraph({ accounts, transactions, rings, onNodeClick, selectedAccountId, simulationResult }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ id: string, x: number, y: number } | null>(null);
  const [filterRingsOnly, setFilterRingsOnly] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Filter data based on view mode
    const activeAccounts = filterRingsOnly
      ? accounts.filter(a => a.ringId)
      : accounts;

    const activeTransactions = transactions.filter(t =>
      activeAccounts.find(a => a.id === t.source) &&
      activeAccounts.find(a => a.id === t.target)
    );

    const elements = [
      ...activeAccounts.map(a => ({
        data: {
          id: a.id,
          risk: a.suspicionScore,
          ringId: a.ringId,
          label: a.id.slice(-6)
        },
        classes: a.ringId ? 'ring-member' : (a.suspicionScore > 50 ? 'suspicious' : 'clean')
      })),
      ...activeTransactions.map(t => ({
        data: {
          id: t.id,
          source: t.source,
          target: t.target,
          isFraud: t.isFraud
        },
        classes: t.isFraud ? 'fraud-edge' : 'normal-edge'
      }))
    ];

    // Inject simulation overlay elements
    if (simulationResult) {
      const tx = simulationResult.hypothetical_tx;
      const affectedIds = new Set(simulationResult.score_deltas.map(d => d.account_id));
      const cycleIds = new Set(simulationResult.new_cycles_created.flatMap(c => c.cycle_members));

      // Add hypothetical nodes if not already present
      if (!activeAccounts.find(a => a.id === tx.sender_id)) {
        elements.push({
          data: { id: tx.sender_id, risk: 0, ringId: undefined as any, label: tx.sender_id.slice(-6) },
          classes: 'sim-node'
        });
      }
      if (!activeAccounts.find(a => a.id === tx.receiver_id)) {
        elements.push({
          data: { id: tx.receiver_id, risk: 0, ringId: undefined as any, label: tx.receiver_id.slice(-6) },
          classes: 'sim-node'
        });
      }

      // Add hypothetical edge
      elements.push({
        data: { id: 'SIM_EDGE', source: tx.sender_id, target: tx.receiver_id, isFraud: false },
        classes: 'sim-edge'
      });

      // Mark affected and cycle nodes
      for (const el of elements) {
        if (el.data.id && affectedIds.has(el.data.id)) {
          el.classes = (el.classes || '') + ' sim-affected';
        }
        if (el.data.id && cycleIds.has(el.data.id)) {
          el.classes = (el.classes || '') + ' sim-cycle';
        }
      }
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'font-family': 'IBM Plex Mono',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'color': '#6B6967',
            'background-color': '#FFFFFF',
            'border-width': 1,
            'border-color': '#D1CEC5',
            'width': 12,
            'height': 12,
            'overlay-opacity': 0,
          }
        },
        {
          selector: '.ring-member',
          style: {
            'border-color': '#B91C1C',
            'border-width': 2,
            'width': 20,
            'height': 20,
            'background-color': '#FEF2F2',
            'font-weight': 'bold',
            'color': '#B91C1C'
          }
        },
        {
          selector: '.suspicious',
          style: {
            'border-color': '#B45309',
            'border-width': 1.5,
            'width': 16,
            'height': 16,
            'background-color': '#FFFBEB'
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 3,
            'border-color': '#1D4ED8',
            'width': 24,
            'height': 24,
            'background-color': '#EFF6FF'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#D1CEC5',
            'target-arrow-color': '#D1CEC5',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.4,
            'arrow-scale': 0.8
          }
        },
        {
          selector: '.fraud-edge',
          style: {
            'line-color': '#B91C1C',
            'target-arrow-color': '#B91C1C',
            'width': 1.5,
            'opacity': 0.8
          }
        },
        {
          selector: '.sim-edge',
          style: {
            'line-color': '#1D4ED8',
            'target-arrow-color': '#1D4ED8',
            'width': 2,
            'opacity': 1,
            'line-style': 'dashed',
            'arrow-scale': 1.2
          }
        },
        {
          selector: '.sim-node',
          style: {
            'border-color': '#1D4ED8',
            'border-width': 2,
            'width': 18,
            'height': 18,
            'background-color': '#EFF6FF',
            'color': '#1D4ED8'
          }
        },
        {
          selector: '.sim-affected',
          style: {
            'border-color': '#B45309',
            'border-width': 2.5,
            'width': 20,
            'height': 20
          }
        },
        {
          selector: '.sim-cycle',
          style: {
            'border-color': '#B91C1C',
            'border-width': 3,
            'width': 22,
            'height': 22,
            'background-color': '#FEF2F2'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: false,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: (node: any) => 400000,
        nodeOverlap: 10,
        idealEdgeLength: (edge: any) => 60,
        edgeElasticity: (edge: any) => 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      }
    });

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.id());
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      setHoveredNode({
        id: node.id(),
        x: evt.renderedPosition.x,
        y: evt.renderedPosition.y
      });
      containerRef.current!.style.cursor = 'pointer';
    });

    cy.on('mouseout', 'node', () => {
      setHoveredNode(null);
      containerRef.current!.style.cursor = 'default';
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [accounts, transactions, onNodeClick, filterRingsOnly, simulationResult]);

  useEffect(() => {
    if (cyRef.current && selectedAccountId) {
      cyRef.current.$(':selected').unselect();
      cyRef.current.$(`#${selectedAccountId}`).select();
    }
  }, [selectedAccountId]);

  const resetZoom = () => {
    cyRef.current?.fit();
  };

  return (
    <div className="relative w-full h-full bg-[var(--color-bg-canvas)]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Floating Controls */}
      <div className="absolute top-4 right-4 flex bg-white rounded-md shadow-sm border border-[var(--color-border-subtle)] p-1 z-10">
        <button
          className={clsx("px-3 py-1.5 text-[11px] font-medium rounded transition-colors", !filterRingsOnly ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50")}
          onClick={() => setFilterRingsOnly(false)}
        >
          All Nodes
        </button>
        <div className="w-[1px] bg-gray-200 mx-1 my-1" />
        <button
          className={clsx("px-3 py-1.5 text-[11px] font-medium rounded transition-colors", filterRingsOnly ? "bg-red-50 text-red-700" : "text-gray-500 hover:bg-gray-50")}
          onClick={() => setFilterRingsOnly(true)}
        >
          Rings Only
        </button>
        <div className="w-[1px] bg-gray-200 mx-1 my-1" />
        <button
          className="px-2 text-gray-500 hover:bg-gray-50 rounded"
          onClick={resetZoom}
          title="Reset Zoom"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-[var(--color-border-subtle)] p-3 rounded-md shadow-sm z-10">
        <h4 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase mb-2 tracking-wider">Legend</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-[var(--color-risk-critical)] bg-red-50" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">Ring Member</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-[var(--color-risk-medium)] bg-yellow-50" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">Suspicious</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full border border-[var(--color-border-medium)] bg-gray-50" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">Clean</span>
          </div>
          <div className="h-[1px] bg-gray-200 my-1" />
          <div className="flex items-center gap-2">
            <div className="w-4 h-[2px] bg-[var(--color-risk-critical)]" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">Fraud Edge</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="absolute bg-white border border-[var(--color-border-medium)] shadow-lg rounded-md p-3 z-50 w-48 pointer-events-none"
          style={{
            left: hoveredNode.x + 10,
            top: hoveredNode.y + 10
          }}
        >
          <div className="flex justify-between items-start mb-1">
            <span className="font-mono text-[13px] font-semibold text-[var(--color-text-primary)]">
              {hoveredNode.id}
            </span>
          </div>
          {(() => {
            const acc = accounts.find(a => a.id === hoveredNode.id);
            if (!acc) return null;
            return (
              <>
                <div className="text-[11px] font-mono mb-1" style={{ color: acc.suspicionScore > 70 ? 'var(--color-risk-critical)' : 'var(--color-text-secondary)' }}>
                  Score: {acc.suspicionScore.toFixed(1)}
                </div>
                {acc.ringId && (
                  <div className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100 inline-block mb-1">
                    {acc.ringId}
                  </div>
                )}
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {acc.patterns.join(', ') || 'No patterns'}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
