import {inject} from 'aurelia-framework';
import {PLATFORM} from 'aurelia-pal';
import {DataService} from './data-service';
import * as d3 from 'd3';

// Inject a DataService instance
@inject(DataService)
export class App {
  dataService;
  repositories;
  users;
  rels;

  resizeTimer;

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
    .then(result => {
      [this.repositories,
       this.users,
       this.rels] = result;
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

    window.addEventListener("resize", this.resizeEventHandler.bind(this));
  }

  detached() {
    window.removeEventListener("resize", this.resizeEventHandler.bind(this));
  }

  resizeEventHandler() {
    clearTimeout(this.resizeTimer);

    this.resizeTimer = setTimeout(this.drawGraph(), 150);
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
  scale(commits, num, max, min) {
    let n_max = d3.max(commits);
    
    commits = commits.map(c => Math.pow(Math.log(c), 3.15));
    num = Math.pow(Math.log(num), 3.15);
    //if(!this.isStray(commits, num))

    return (max - min) * (num / n_max) + min;
    //else
    //  return max+1;
  }

  /**
   * Used for identifying too high values in the array
   * of commits
   */
  isStray(commits, commit) {
    return commit >= 2 * this.quartile(commits, 99);
  }

  /**
   * Used for identifying a statistical quartile
   * in an array of commits
   */
  quartile(array, percent) {
    if (!percent) percent = 50;
    var n = Math.round(array.length * percent / 100);
    return array[n];
  }
  
  /**
   * Draws the graph!
   */
  drawGraph() {
    let links = [];
    let rels = this.rels;
    let width = Number.parseInt(d3.select("svg").style("width"));
    let height = Number.parseInt(d3.select("svg").style("height"));
    let graph = d3.select("#graph");
    let app = this;

    graph.selectAll("*").remove();

    // Transform data
    let repositories = this.transform(this.repositories, 'repo',
      entry => entry.name,
      entry => { return { n_commits: entry.n_commits } });

    let users = this.transform(this.users, 'user',
      entry => entry.hashed_email + entry.name,
      entry => { return { 
        any_commit_url: entry.any_commit_url, 
        n_commits: entry.n_commits,
        name: entry.name } });

    // Create a single list of datapoints for users and repositories
    // which are identified through their type
    let nodeData = repositories.concat(users);

    rels = this.rels.filter(rel =>
      nodeData.some(node => node.id == rel.repository_name) &&
      nodeData.some(node => node.id == (rel.user_hashed_email + rel.user_name)))

    let commits = rels
      .map(rel => rel.n_commits)
      .sort((a,b) => a-b);

    // Create Links between repositories (invisible, used only for force distribution)
    for(var i = 0; i < rels.length - 1; i++) {
        links.push({ 
          source: rels[i].repository_name, 
          target: rels[i].user_hashed_email + rels[i].user_name, 
          value: rels[i].n_commits });
    }

    // Define the div for the tooltip
    var tooltip = d3.select("body").append("div")	
        .attr("class", "tooltip")				
        .style("opacity", 0);

    // Draw links
    var link = graph.append("g")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("class", "links")
        .selectAll("line")
        .data(links)
        .enter().append("line")
          .attr("stroke", "#000")
          .attr("stroke-width", d => this.scale(commits, d.value, 4, 2))
          .attr("opacity",      d => this.scale(commits, d.value, 1, 0.3))

    // Draw repository nodes
    let node = graph.append("g")
        .attr("class", "nodes")
          .selectAll("circle")
          .data(nodeData)
          .enter().append("circle")
            .attr("class", "node")
            .attr("r", d =>
                d.n_commits ? 
                d.type == 'repo' ?
                this.scale(commits, d.n_commits, 15, 4) : 
                this.scale(commits, d.n_commits, 6, 3) :
                3)
            .attr("stroke", "#333")
            .attr("fill", d => d.type == 'repo' ? 
                "#00BCD4" : 
                "#FF9800")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended))
            .on("mouseover", function(d) {
                d3.event.stopPropagation();

                tooltip.transition()
                    .style("opacity", .9);	

                switch(d.type) {
                  case 'repo':
                    tooltip.html(`${d.id}<br/>Commits: ${d.n_commits}`)	
                      .style("left", (d3.event.pageX) + "px")		
                      .style("top", (d3.event.pageY - 28) + "px");
                    break;
                  case 'user':
                    tooltip.html(`${d.name}<br/>Commits: ${d.n_commits}`)	
                      .style("left", (d3.event.pageX) + "px")		
                      .style("top", (d3.event.pageY - 28) + "px");
                    break;
                }
            })
            .on("mouseout", function(d) {		
                tooltip.transition()	
                    .style("opacity", 0);	
            })
            .on("click", function(d) {		
                switch(d.type) {
                  case 'repo': window.open(`http://github.com/${d.id}`, '_blank'); break;
                  case 'user': 
                    app.dataService.fetchUserInfo(d.any_commit_url)
                        .then(user => window.open(user.author.html_url, '_blank')); break;
                }
            });

    // Setup forces
    let simulation = d3.forceSimulation()
        .force("charge", d3.forceManyBody().strength(-10))
        .force("link", d3.forceLink().distance(25).strength(0.7).id(function(d) { return d.id; }))
        .force("center", d3.forceCenter(width / 2, height / 2))
        /*.force("collide", d3.forceCollide(d => { return d.type == 'repo' ?
          this.scale(commits, d.n_commits, 15, 4) + 3 : 
          this.scale(commits, d.n_commits, 6, 3) + 2
        }))*/
        .force("x", d3.forceX())
        .force("y", d3.forceY());

    // Start force simulation
    simulation
      .nodes(nodeData)
      .on("tick", ticked);

    simulation.force("link")
        .links(links);

    let time = Date.now();

    /**
     * On each tick of the force simulation, set the
     * link and node positions to their new position.
     */
    function ticked() {
        //if(Date.now() - time < 3000) return;
        link
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

        node
          .attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; });

        //simulation.stop();
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
