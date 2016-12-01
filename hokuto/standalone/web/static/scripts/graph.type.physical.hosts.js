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


// The physical graph type displays hostgroups and hosts, organized by physical dependencies

define(['graph.type.base'], function (base) {
    var PhysicalHosts = function (graph) {
        this.name = 'physical.hosts';
        this.graph = graph;

        this.getCommandsForNode = function (node) {
            return [{
                image: 'glass-plus.png',
                label: 'Zoom on this node',
                click: function () {
                    window.location.hash = '#logical.host/' + node.id;
                }
            }];
        };
    };

    PhysicalHosts.prototype = base;

    return PhysicalHosts;
});
