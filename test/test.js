const ThreadPool = require( "../build/main.js").default;
const os = require( "os");
// const {fileURLToPath} = require( 'url');
const {dirname, join} = require( 'path');
//
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

const cpus = os.cpus().length;
let max = 1e7
let min = 2
let params = []
const tp = new ThreadPool(join(__dirname, "./test1.js"), cpus - 2, cpus)

const baseStep = Math.ceil((max - min) / cpus)
let start = min
for (let i = 0; i < cpus; i++) {
  const queue = {
    callback: (err, res) => {
      if (err) {
        throw err
      }
      params = params.concat(res);
    }, // 回调函数
    getData: () => {
      return {
        start: start,
        step: baseStep,
        params: params
      }
    } // 传递给run的data
  }
  if(i===3){
    tp.close()
  }
  tp.run(queue)
  start += baseStep
}


