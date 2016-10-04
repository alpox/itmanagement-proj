import {inject} from 'aurelia-framework';
import {DataService} from './data-service';
import * as d3 from 'd3';

// Inject a DataService instance
@inject(DataService)
export class App {
  dataService;
  repositories;
  users;
  rels;

  /**
   * The constructor of the class App
   * Gets a DataService instance injected
   */
  constructor(dataService) {
    this.dataService = dataService;
  }

  /**
   * Acivate makes the framework wait for the Promise
   * to resolve to true before attaching the component
   * so the needed data will be available.
   * 
   * We catch all data from the endpoints here with
   * Promise.all, log an error if one occurs and
   * JSON.parse the returned values and store them
   * into the class variables.
   */
  activate() {
    return Promise.all([
      this.dataService.fetchRepositories(),
      this.dataService.fetchUsers(),
      this.dataService.fetchRels()
    ])
    .catch(console.log)
    .then(result => {
      [this.repositories,
       this.users,
       this.rels] = result.map(res => JSON.parse(res.response));
       return true;
    });
  }

  /**
   * The attached() hook gets called when the component Is
   * attached to the website.
   * We just draw our graph here.
   */
  attached() {
    this.drawGraph();
  }

  /**
   * Transforms some data into a format which
   * can be used by d3.
   * 
   * This means the data becomes the following format:
   * {
   *    id: string    // A unique identifier
   *    type: string  // The type of the data. 
   *                  // Is either repo or user in our case
   *    ...           // Further specific entries depending
   *                  // on the type
   * }
   */
  transform(data, type, idFunc, includeFunc) {
    return data.map(entry => {
      let includes = includeFunc(entry) || {};
      let transformed = {
        id: idFunc(entry),
        type: type
      }
      Object.assign(transformed, includes);
      return transformed;
    })
  }

  /**
   * Given a maximum number of commits and
   * an arbitrary number of commits returns the
   * percentage of the given number of commits
   * in respect to the maximum number of commits.
   * 
   * Used for scaling the nodes and edges
   */
  scale(n_max, n_commits, max, min) {
    return (max - min) * (n_commits / n_max) + min;
  }

  /**
   * Draws the graph!
   */
  drawGraph() {
    let links = [];
    let width = 1000;
    let height = 800;
    let graph = d3.select("#graph");

    // Transform data
    let repositories = this.transform(this.repositories, 'repo',
      entry => entry.name,
      entry => { return { n_commits: entry.n_commits } });

    let users = this.transform(this.users, 'user',
      entry => entry.hashed_email,
      entry => { return { any_commit_sha: entry.any_commit_sha } });

    // Create a single list of datapoints for users and repositories
    // which are identified through their type
    let nodeData = repositories.concat(users);

    let rels = this.rels.filter(rel =>
      nodeData.some(node => node.id == rel.repository_name) &&
      nodeData.some(node => node.id == rel.user_hashed_email))

    let max_commits = d3.max(rels.map(rel => rel.n_commits));

    // Create Links between repositories (invisible, used only for force distribution)
    for(var i = 0; i < rels.length - 1; i++) {
        links.push({ 
          source: rels[i].repository_name, 
          target: rels[i].user_hashed_email, 
          value: rels[i].n_commits });
        users.find(user => user.id == rels[i].user_hashed_email)
          .n_commits = rels[i].n_commits;
    }

    // Draw links
    var link = graph.append("g")
      .attr("class", "links")
        .selectAll("line")
        .data(links)
        .enter().append("line")
          .attr("stroke", "#000")
          .attr("stroke-width", d => this.scale(max_commits, d.value, 5, 1))
         // .attr("opacity", d => this.scale(max_commits, d.value, 1))

    // Draw repository nodes
    let node = graph.append("g")
        .attr("class", "nodes")
          .selectAll("circle")
          .data(nodeData)
          .enter().append("circle")
            .attr("r", d => d.type == 'repo' ? 
                this.scale(max_commits, d.n_commits, 7, 4) : 
                this.scale(max_commits, d.n_commits, 6, 3))
            .attr("fill", d => d.type == 'repo' ? 
                "#00BCD4" : 
                "#FF9800")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

    // Setup forces
    let simulation = d3.forceSimulation()
        .force("charge", d3.forceManyBody().strength(-10))
        .force("link", d3.forceLink().distance(20).strength(0.2).id(function(d) { return d.id; }))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX())
        .force("y", d3.forceY());

    // Start force simulation
    simulation
      .nodes(nodeData)
      .on("tick", ticked);

    simulation.force("link")
        .links(links);

    /**
     * On each tick of the force simulation, set the
     * link and node positions to their new position.
     */
    function ticked() {
        link
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

        node
          .attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; });
    }

    /**
     * And some dragevents here...
     * These are mainly copied from the d3
     * examples out there and do nothing else than applying
     * The necessary eventhandling for drag & drop
     */
    function dragstarted(d) {
      if (!d3.event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
    }

    function dragended(d) {
      if (!d3.event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }
}
