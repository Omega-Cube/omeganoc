/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

define([], function () {
    // Internal tools
    function updateNodeBbox() {
        this.bbox = {
            left: this.x - this.radius,
            right: this.x + this.radius,
            top: this.y - this.radius,
            bottom: this.y + this.radius,
        };
    }

    function updateGroupBbox() {
        this.bbox = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
        var node;
        for (var n in this.nodes) {
            node = this.nodes[n];
            if (node.bbox.left < this.bbox.left)
                this.bbox.left = node.bbox.left;
            if (node.bbox.right > this.bbox.right)
                this.bbox.right = node.bbox.right;
            if (node.bbox.top < this.bbox.top)
                this.bbox.top = node.bbox.top;
            if (node.bbox.bottom > this.bbox.bottom)
                this.bbox.bottom = node.bbox.bottom;
        }

        this.bbox.width = this.bbox.right - this.bbox.left;
        this.bbox.height = this.bbox.bottom - this.bbox.top;
    }

    // This function augments a graph structure (returned by the server as json)
    // by injecting some graph manipulation tools into it
    return function (graphObject) {
        var result = graphObject;

        result.updateBbox = updateGroupBbox;

        for (var id in result.groups) {
            result.groups[id].nodes = {};
            result.groups[id].length = 0;
            result.groups[id].updateBbox = updateGroupBbox;
        }

        // Consolidate up edges and groups
        result.edges = [];
        var i = 0, node;
        for (var n in result.nodes) {
            node = result.nodes[n];
            for (i = 0; i < result.nodes[n].link_out.length; ++i) {
                var edge = node.link_out[i];
                edge.source = result.nodes[edge.source];
                edge.target = result.nodes[edge.target];
                result.edges.push(edge);
            }
            node.link_in = []; // We clear link_in to refill it later with the same references contained by link_out[] and edges[]
            node.updateBbox = updateNodeBbox;
            node.updateBbox();

            // Group
            if (node.group) {
                node.group = result.groups[node.group];
                node.group.nodes[node.id] = node;
                node.group.length += 1;
            }
        }

        for (var e in result.edges) {
            result.nodes[result.edges[e].target.id].link_in.push(result.edges[e]);
        }

        // Bounding box
        result.updateBbox();

        // Also compute bboxes for groups
        for (id in result.groups) {
            result.groups[id].updateBbox();
        }

        return result;
    };
});
