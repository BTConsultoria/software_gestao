const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const flash = require('connect-flash');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'clebsonsouza055@gmail.com',
    pass: 'tijizudpnakhpzwv'
  }
});
console.log('hey');

const app = express();
app.use("/cadastro_files",express.static("cadastro_files"));
app.use("/login_files",express.static("login_files"));
app.use("/assets",express.static("assets"));
app.set('view engine', 'ejs');


app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root', 
  password: 'Teste123', 
  database: 'biotech'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database: ' + err.stack);
    return;
  }
  console.log('Connected to database as id ' + connection.threadId);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.sendFile(__dirname + '/welcome.html'); 
  }else {
    res.sendFile(__dirname + '/index.html');
  }
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.sendFile(__dirname + '/welcome.html'); 
  } else{
    res.render('login', { showErrorMessage: false });
  }
});

app.get('/graph', (req, res) => {
  res.render('graph');
});

app.get('/password-reset', (req, res) => {
  res.render('password-reset', { 
    showSuccessMessage: false,
    showErrorMessage: false
  });
});

app.get('/changePass', (req, res) => {
  const email = req.query.email;
  const token = req.query.token;
  connection.query('SELECT * FROM cliente_bt WHERE email = ? AND reset_token = ? AND reset_token_expiration > NOW()', [email, token], (error, results, fields) => {
    if (error) {
      console.error('Error querying database: ' + error.stack);
      res.render('changePass', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while processing your request.' });
    } else if (results.length > 0) {
      res.render('changePass', { showSuccessMessage: false, showErrorMessage: false, email: email, token: token });
    } else {
      res.render('changePass', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'Invalid password reset link. Please check your email for the correct link.' });
    }
  });
});

app.get('/passChanged', (req, res) => {
  res.render('passChanged');
});

app.get('/custos', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 

    const sql = 'SELECT * FROM custos WHERE cliente_bt_id = ?'; 
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      const formattedResults = results.map((row) => {
        const formattedDataRegistro = formatDate(row.data_registro);
        const formattedDataSaida = formatDate(row.data_saida);
        return { ...row, data_registro: formattedDataRegistro, data_saida: formattedDataSaida };
      });

      res.render('custos', { custos: formattedResults });
    });
  } else {
    res.redirect('/login');
  }
});

app.get('/faturamento', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 

    const sql = 'SELECT * FROM faturamento WHERE cliente_bt_id = ?'; 
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      const formattedResults = results.map((row) => {
        const formattedData = formatDate(row.data);
        return { ...row, data: formattedData };
      });

      res.render('faturamento', { faturamento: formattedResults });
    });
  } else {
    res.redirect('/login');
  }
});


app.get('/fin_dashboard', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email;

    const sql = 'SELECT pagamento, COUNT(*) AS count FROM faturamento WHERE cliente_bt_id = ? GROUP BY pagamento';
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      const labels = results.map((row) => row.pagamento);
      const counts = results.map((row) => row.count);

      const totalValorLiqSql = 'SELECT SUM(valor_liq) AS totalValorLiq FROM faturamento WHERE cliente_bt_id = ?';
      connection.query(totalValorLiqSql, [email], (err, totalLiqResults) => {
        if (err) {
          console.error('Error executing the query:', err);
          res.status(500).send('Internal Server Error');
          return;
        }

        const totalValorLiq = totalLiqResults[0].totalValorLiq;

        const planoSql = 'SELECT plano, COUNT(*) AS count FROM faturamento WHERE cliente_bt_id = ? GROUP BY plano ORDER BY COUNT(*) DESC'; // Ordenando por quantidade de vezes que aparece
        connection.query(planoSql, [email], (err, planoResults) => {
          if (err) {
            console.error('Error executing the query:', err);
            res.status(500).send('Internal Server Error');
            return;
          }
          const mostUsedPlano = planoResults[0].plano;

          const planoLabels = planoResults.map((row) => row.plano);
          const planoCounts = planoResults.map((row) => row.count);

          const totalCostSql = 'SELECT SUM(valor_total) AS totalCost FROM custos WHERE cliente_bt_id = ?';
          connection.query(totalCostSql, [email], (err, totalCostResults) => {
            if (err) {
              console.error('Error executing the query:', err);
              res.status(500).send('Internal Server Error');
              return;
            }

            const totalCost = totalCostResults[0].totalCost;

            const revenue = totalValorLiq - totalCost;

            const consultationsSql = 'SELECT COUNT(*) AS numberOfConsultations FROM faturamento WHERE cliente_bt_id = ? AND data BETWEEN DATE_SUB(NOW(), INTERVAL 3 MONTH) AND NOW()';
            connection.query(consultationsSql, [email], (err, consultationsResults) => {
              if (err) {
                console.error('Error executing the query:', err);
                res.status(500).send('Internal Server Error');
                return;
              }

              const numberOfConsultations = consultationsResults[0].numberOfConsultations || 0;

              const annualMediumBalance = revenue / 12;

              const currentMonthRevenueSql = `SELECT SUM(valor_liq) AS currentMonthRevenue FROM faturamento WHERE cliente_bt_id = ? AND MONTH(data) = MONTH(NOW()) AND YEAR(data) = YEAR(NOW())`;

              connection.query(currentMonthRevenueSql, [email], (err, currentMonthRevenueResults) => {
                if (err) {
                  console.error('Error executing the query:', err);
                  res.status(500).send('Internal Server Error');
                  return;
                }

                const currentMonthRevenue = currentMonthRevenueResults[0].currentMonthRevenue || 0; //Se não tiver lucro no mês, retorna o valor 0.

              res.render('fin_dashboard', { email, labels, counts, totalValorLiq, planoLabels, planoCounts, revenue, numberOfConsultations, annualMediumBalance, mostUsedPlano, currentMonthRevenue}); // Pass data to EJS template
            });
           });
          });
        });
      });
    });
  } else {
    res.redirect('/login');
  }
});



app.get('/client', (req, res) => {
    res.render('client');
});



function formatDate(date) {
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const formattedDate = new Date(date).toLocaleDateString('pt-BR', options);
  return formattedDate;
}


passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser((email, done) => {
  connection.query(
    'SELECT * FROM cliente_bt WHERE email = ?',
    [email],
    (error, results, fields) => {
      if (error) {
        console.error('Error querying database:', error);
        return done(error);
      }

      if (results.length > 0) {
        const user = results[0];
        return done(null, user);
      } else {
        return done(new Error('User not found'));
      }
    }
  );
});


app.post('/login', passport.authenticate('local', {
  successRedirect: '/welcome',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/welcome', (req, res) => {
  if (req.isAuthenticated()) {
    return res.sendFile(__dirname + '/welcome.html');
  }
  res.redirect('/login');
});

app.get('/client_table', (req, res) => {
  if (req.isAuthenticated()) {
    res.render('client_table');
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/api/client_table', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 

    const sql = 'SELECT * FROM pacientes WHERE cliente_bt_id = ?';
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).json(results);
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.put('/api/client_table/:cpf', (req, res) => {
  if (req.isAuthenticated()) {
    const cpf = req.params.cpf;
    const pacienteData = req.body;

    const sql = 'UPDATE pacientes SET ? WHERE cpf = ?';
    connection.query(sql, [pacienteData, cpf], (err, results) => {
      if (err) {
        console.log(err);
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Paciente updated successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.delete('/api/client_table/:cpf', (req, res) => {
  if (req.isAuthenticated()) {
    const cpf = req.params.cpf;

    const sql = 'DELETE FROM pacientes WHERE cpf = ?';
    connection.query(sql, [cpf], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Paciente deleted successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/api/consultas_table', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 

    const sql = 'SELECT * FROM consultas WHERE cliente_bt_id = ?';
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).json(results);
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.delete('/api/consultas_table/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;

    const sql = 'DELETE FROM consultas WHERE id = ?';
    connection.query(sql, [id], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Consulta deleted successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});


app.put('/api/consultas_table/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;
    const consultaData = req.body;

    const sql = 'UPDATE consultas SET ? WHERE id = ?';
    connection.query(sql, [consultaData, id], (err, results) => {
      if (err) {
        console.log(err);
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Consulta updated successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/produtos_table', (req, res) => {
  if (req.isAuthenticated()) {
    res.render('produtos_table');
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.get('/api/produtos_table', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 

    const sql = 'SELECT * FROM produtos WHERE cliente_bt_id = ?';
    connection.query(sql, [email], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).json(results);
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.put('/api/produtos_table/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;
    const produtoData = req.body;

    const sql = 'UPDATE produtos SET ? WHERE id = ?';
    connection.query(sql, [produtoData, id], (err, results) => {
      if (err) {
        console.log(err);
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Product updated successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.delete('/api/produtos_table/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;

    const sql = 'DELETE FROM produtos WHERE id = ?';
    connection.query(sql, [id], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Product deleted successfully');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});






passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, (email, password, done) => {
  connection.query(
    'SELECT * FROM cliente_bt WHERE email = ?',
    [email],
    (error, results, fields) => {
      if (error) {
        console.error('Error querying database:', error);
        return done(error);
      }

      if (results.length > 0) {
        const user = results[0];
        bcrypt.compare(password, user.senha, (err, result) => {
          if (err) {
            console.error('Error comparing passwords:', err);
            return done(err);
          } else if (result) {
            console.log('User authenticated' + user.email);
            
            return done(null, user);
          } else {
            console.log("auto");
            return done(null, false, { message: 'Incorrect password' });
          }
        });
      } else {
        return done(null, false, { message: 'User not found' });
      }
    }
  );
}));


app.post('/submit-form', (req, res) => {
  const somaValue = Number(req.body.soma);

  if (somaValue !== 18) {
    return res.status(400).send('The value of "soma" must be 18.');
  }

});

app.post('/', (req, res) => {
  const { nome, email, especialidade, medicos, plano, soma, check, password } = req.body;

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.error('Error hashing password: ' + err.stack);
      res.send('An error occurred while processing your request.');
    } else {
      connection.query(
        'INSERT INTO cliente_bt (nome, email, esp, num_med, plano, soma, receber_novidades, senha) VALUES (?, ?, ?, ?, ?, ?, IFNULL(?, 0), ?)',
        [nome, email, especialidade, medicos, plano, soma, check, hash],
        (error, results, fields) => {
          if (error) {
            console.error('Error inserting data: ' + error.stack);
            res.send('An error occurred while processing your request.');
          } else {
            console.log('Inserted ' + results.affectedRows + ' rows');
            res.send("Registered");
          }
        }
      );
    }
  });
});

app.post('/password-reset', (req, res) => {
  const email = req.body.email;

  connection.query('SELECT * FROM cliente_bt WHERE email = ?',[email],(error, results, fields) => {
      if (error) {
        console.error('Error querying database: ' + error.stack);
        res.render('password-reset', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while processing your request.' });
      } 
      else if (results.length > 0) {

        const token = Math.random().toString(36).slice(2);
        connection.query(
          'UPDATE cliente_bt SET reset_token = ?, reset_token_expiration = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = ?',
          [token, email],
          (error, results, fields) => {
            if (error) {
              console.error('Error updating database: ' + error.stack);
              res.render('password-reset', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while processing your request.' });
            } else {
              const resetUrl = `http://localhost:3000/changePass?email=${email}&token=${token}`;
              const mailOptions = {
                from: 'clebsonsouza055@gmail.com',
                to: email,
                subject: 'Password Reset Request',
                text: `Please click the following link to reset your password: ${resetUrl}`
              };
              transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  console.error('Error sending email: ' + error.stack);
                  res.render('password-reset', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while sending the email.' });
                } else {
                  console.log('Email sent: ' + info.response);
                  res.render('password-reset', { showSuccessMessage: true, successMessage: 'Email sent', showErrorMessage: false });
                }
              });
            }
          }
        );
      } else {
        res.render('password-reset', { 
          showSuccessMessage: false,
          showErrorMessage: true, 
          errorMessage: 'No user found with the given email address.' 
        });
      }
    }
  );
});

app.post('/changePass', (req, res) => {
  const email = req.body.email;
  const token = req.body.token;
  const password = req.body.password;
  console.log(email + " " + token);

  connection.query('SELECT * FROM cliente_bt WHERE email = ? AND reset_token = ? AND reset_token_expiration > NOW()', [email, token], (error, results, fields) => {
    if (error) {
      console.error('Error querying database: ' + error.stack);
      res.render('changePass', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while processing your request.' });
    } else if (results.length > 0) {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
          console.error('Error hashing password: ' + err.stack);
          res.send('An error occurred while processing your request.');
        } else {
          connection.query('UPDATE cliente_bt SET senha = ?, reset_token = NULL, reset_token_expiration = NULL WHERE email = ?', [hash, email], (error, results, fields) => {
            if (error) {
              console.error('Error updating database: ' + error.stack);
              res.render('changePass', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'An error occurred while updating your password.' });
            } else {
              res.render('passChanged', { showSuccessMessage: false, showErrorMessage: true, errorMessage:  'DONE'});
            }
          });
        }
      });
    } else {
      res.render('changePass', { showSuccessMessage: false, showErrorMessage: true, errorMessage: 'Invalid password reset link. Please check your email for the correct link.' });
    }
  });
});

app.post('/save-entry', (req, res) => {
  const { dataRegistro, dataSaida, descricao, quantidade, valorUnit } = req.body;
  const userEmail = req.user.email; 

  const valorTotal = quantidade * valorUnit;

  const insertQuery = `INSERT INTO custos (data_registro, data_saida, descricao, quantidade, valor_unit, valor_total, cliente_bt_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const insertValues = [dataRegistro, dataSaida, descricao, quantidade, valorUnit, valorTotal, userEmail];

  connection.query(insertQuery, insertValues, (error, insertResult) => {
    if (error) {
      console.error('Error saving entry:', error);
      res.status(500).json({ error: 'An error occurred while saving the entry' });
    } else {
      console.log('Entry saved successfully');
      
      const fetchQuery = 'SELECT * FROM custos WHERE id = ?';
      const fetchValues = [insertResult.insertId];

      connection.query(fetchQuery, fetchValues, (fetchError, fetchResult) => {
        if (fetchError) {
          console.error('Error fetching data:', fetchError);
          res.status(500).json({ error: 'An error occurred while fetching the data' });
        } else {
          const formattedDataRegistro = formatDate(fetchResult[0].data_registro);
          const formattedDataSaida = formatDate(fetchResult[0].data_saida);
          
          const newCusto = {
            ...fetchResult[0],
            data_registro: formattedDataRegistro,
            data_saida: formattedDataSaida
          };
          
          res.status(200).json({ custo: newCusto });
        }
      });
    }
  });
});

app.post('/save-entry-fat', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email;
    const {
      data,
      paciente,
      cpf,
      plano,
      procedimento,
      situacao,
      valor,
      pagamento,
      parcelamento,
      bandeira,
      taxa,
      desconto,
      valorLiq,
    } = req.body;

    if (!data || !paciente || !cpf || !plano || !procedimento || !situacao || !valor || !pagamento || !parcelamento || !bandeira || !taxa || !desconto || !valorLiq) {
      res.status(400).json({ error: 'All fields are required.' });
      return;
    }

    const sql = 'INSERT INTO faturamento (data, paciente, cpf, plano, procedimento, situacao, valor, pagamento, parcelamento, bandeira, taxa, desconto, valor_liq, cliente_bt_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    connection.query(
      sql,
      [data, paciente, cpf, plano, procedimento, situacao, valor, pagamento, parcelamento, bandeira, taxa, desconto, valorLiq, email],
      (err, result) => {
        if (err) {
          console.error('Error executing the query:', err);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }

        const newEntry = {
          data: data,
          paciente: paciente,
          cpf: cpf,
          plano: plano,
          procedimento: procedimento,
          situacao: situacao,
          valor: valor,
          pagamento: pagamento,
          parcelamento: parcelamento,
          bandeira: bandeira,
          taxa: taxa,
          desconto: desconto,
          valor_liq: valorLiq,
          cliente_bt_id: email,
          id: result.insertId, 
        };

        res.status(200).json({ custo: newEntry });
      }
    );
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});



app.post('/delete-entries', (req, res) => {
  const { ids } = req.body;

  const deleteQuery = 'DELETE FROM custos WHERE id IN (?)';
  const deleteValues = [ids];

  connection.query(deleteQuery, deleteValues, (error, deleteResult) => {
    if (error) {
      console.error('Error deleting entries:', error);
      res.status(500).json({ error: 'An error occurred while deleting the entries' });
    } else {
      console.log('Entries deleted successfully');
      res.status(200).json({ message: 'Entries deleted successfully' });
    }
  });
});


app.post('/save-entry-fat', (req, res) => {
  const { data, paciente, cpf, plano, procedimento, situacao, valor, pagamento, parcelamento, bandeira, taxa, desconto, valor_liq } = req.body;
  const userEmail = req.user.email; 

  const insertQuery = `INSERT INTO faturamento (data, paciente, cpf, plano, procedimento, situacao, valor, pagamento, parcelamento, bandeira, taxa, desconto, valor_liq, cliente_bt_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const insertValues = [data, paciente, cpf, plano, procedimento, situacao, valor, pagamento, parcelamento, bandeira, taxa, desconto, valor_liq, userEmail];

  connection.query(insertQuery, insertValues, (error, insertResult) => {
    if (error) {
      console.error('Error saving entry:', error);
      res.status(500).json({ error: 'An error occurred while saving the entry' });
    } else {
      console.log('Entry saved successfully');
      
      const fetchQuery = 'SELECT * FROM faturamento WHERE id = ?'; 
      const fetchValues = [insertResult.insertId];

      connection.query(fetchQuery, fetchValues, (fetchError, fetchResult) => {
        if (fetchError) {
          console.error('Error fetching data:', fetchError);
          res.status(500).json({ error: 'An error occurred while fetching the data' });
        } else {
          res.status(200).json({ faturamento: fetchResult[0] });
        }
      });
    }
  });
});

app.post('/delete-entries-fat', (req, res) => {
  const { ids } = req.body;

  const deleteQuery = 'DELETE FROM faturamento WHERE id IN (?)';
  const deleteValues = [ids];

  connection.query(deleteQuery, [deleteValues], (error, deleteResult) => {
    if (error) {
      console.error('Error deleting entries:', error);
      res.status(500).json({ error: 'An error occurred while deleting the entries' });
    } else {
      console.log('Entries deleted successfully');
      res.status(200).json({ message: 'Entries deleted successfully' });
    }
  });
});

app.post('/client', (req, res) => {
  console.log("chegou errado");
  if (req.isAuthenticated()) {
    const email = req.user.email; 
    const formData = req.body;

    const sql = 'INSERT INTO pacientes SET ?';
    connection.query(sql, [{...formData, cliente_bt_id: email}], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Data inserted successfully.');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.post('/api/consultas_table', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 
    const formData = req.body;

    const sql = 'INSERT INTO consultas SET ?';
    connection.query(sql, [{ ...formData, cliente_bt_id: email }], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Data inserted successfully.');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.post('/api/produtos_table', (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.user.email; 
    const produtoData = req.body;

    const sql = 'INSERT INTO produtos SET ?';
    connection.query(sql, [{ ...produtoData, cliente_bt_id: email }], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Produto cadastrado com sucesso');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});


app.post('/api/produtos_table/entrada/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;
    const quantidade = req.body.quantidade;

    const sql = 'UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?';
    connection.query(sql, [quantidade, id], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Entrada registrada com sucesso');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.post('/api/produtos_table/saida/:id', (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.params.id;
    const quantidade = req.body.quantidade;

    const sql = 'UPDATE produtos SET quantidade = GREATEST(0, quantidade - ?) WHERE id = ?';
    connection.query(sql, [quantidade, id], (err, results) => {
      if (err) {
        console.error('Error executing the query:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.status(200).send('Saída registrada com sucesso');
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}...`));
