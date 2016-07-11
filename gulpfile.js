var gulp = require('gulp');
var mocha = require('gulp-spawn-mocha');

function test() {
   return gulp.src(['test/*.js'], { read: false })
   .pipe(mocha({
      R: 'spec',
      env: {'NODE_ENV': 'test'},
   }));
}

gulp.task('test', function() {
   return test();
});

gulp.task('watch', function () {
   gulp.watch(['src/**/*.js', 'test/**/*.js'], ['test']);
});
