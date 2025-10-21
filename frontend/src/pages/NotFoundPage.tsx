import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  const handleGoBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you visited does not exist."
        extra={[
          <Button type="primary" key="home" onClick={handleGoHome}>
            Go Home
          </Button>,
          <Button key="back" onClick={handleGoBack}>
            Go Back
          </Button>,
        ]}
      />
    </div>
  );
};
