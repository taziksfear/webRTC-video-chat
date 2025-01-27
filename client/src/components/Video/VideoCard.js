import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { FaMicrophoneSlash, FaVideoSlash } from "react-icons/fa";

const VideoCard = ({ peer, video, audio }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (peer) {
      const handleStream = (stream) => {
        console.log('Received stream in VideoCard:', stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error('Error playing video:', err);
          });
        }
      };

      const handleError = (err) => {
        console.error('Peer error:', err);
      };

      peer.on('stream', handleStream);
      peer.on('error', handleError);

      return () => {
        peer.off('stream', handleStream);
        peer.off('error', handleError);
      };
    }
  }, [peer]);

  return (
    <VideoContainer>
      <Video playsInline autoPlay ref={videoRef} />
      <StatusIcons>
        {!video && (
          <Icon>
            <FaVideoSlash />
          </Icon>
        )}
        {!audio && (
          <Icon>
            <FaMicrophoneSlash />
          </Icon>
        )}
      </StatusIcons>
    </VideoContainer>
  );
};

const VideoContainer = styled.div`
  position: relative;
  width: 755px;
  height: 350px;
  border-radius: 10px;
  overflow: hidden;
  background-color: black;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
`;

const StatusIcons = styled.div`
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  gap: 5px;
`;

const Icon = styled.span`
  font-size: 18px;
  color: red;
`;

export default VideoCard;